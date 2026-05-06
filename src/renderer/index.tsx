import React from "react";
import { Renderer } from "@freelensapp/extensions";
import { WorkloadTopologyPage } from "./pages/WorkloadTopologyPage";

const { Component } = Renderer;

function TopologyIcon(props: Renderer.Component.IconProps) {
  return <Component.Icon {...props} material="account_tree" tooltip="Topology" />;
}

export default class WorkloadTopologyRenderer extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "workload-topology",
      components: {
        Page: WorkloadTopologyPage
      }
    }
  ];

  clusterPageMenus = [
    {
      id: "workload-topology",
      target: { pageId: "workload-topology" },
      title: "Workload Topology",
      orderNumber: 60,
      components: {
        Icon: TopologyIcon
      }
    }
  ];
}
