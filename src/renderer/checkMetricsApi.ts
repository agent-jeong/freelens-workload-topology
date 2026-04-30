import { Renderer } from "@freelensapp/extensions";
const podMetricsApi = (Renderer.K8sApi as any).podMetricsApi;
console.log(podMetricsApi);
