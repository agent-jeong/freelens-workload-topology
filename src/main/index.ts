import { Main } from "@freelensapp/extensions";

export default class WorkloadTopologyMain extends Main.LensExtension {
  onActivate(): void {
    console.log("workload topology extension activated");
  }

  onDeactivate(): void {
    console.log("workload topology extension deactivated");
  }
}
