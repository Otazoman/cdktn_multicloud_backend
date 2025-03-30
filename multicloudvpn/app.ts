import { App } from "cdktf";
import { MultiCloudVpnStack } from "./stacks/MultiCloudVpnStack";

const app = new App();
new MultiCloudVpnStack(app, "app");
app.synth();
