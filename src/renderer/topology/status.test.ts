import assert from "node:assert/strict";
import test from "node:test";
import { isPodReady, podStatus, serviceStatus } from "./status";
import type { KubeObjectLike } from "../types";

function pod(name: string, labels: Record<string, string>, status: KubeObjectLike["status"]): KubeObjectLike {
  return { metadata: { name, namespace: "default", labels }, status };
}

test("podStatus flags init container image pull failures as danger", () => {
  assert.equal(podStatus(pod("api", {}, {
    phase: "Pending",
    initContainerStatuses: [{ name: "init", state: { waiting: { reason: "ImagePullBackOff" } } }]
  })), "danger");
});

test("serviceStatus requires a ready matching pod", () => {
  const service: KubeObjectLike = { spec: { selector: { app: "api" } } };
  const notReady = pod("api-1", { app: "api" }, {
    phase: "Running",
    conditions: [{ type: "Ready", status: "False" }]
  });
  const ready = pod("api-2", { app: "api" }, {
    phase: "Running",
    conditions: [{ type: "Ready", status: "True" }]
  });

  assert.equal(isPodReady(notReady), false);
  assert.equal(serviceStatus(service, [notReady]), "warning");
  assert.equal(serviceStatus(service, [notReady, ready]), "healthy");
});
