import { BrowserWindow } from "electrobun/bun";
import { rpc } from "./rpc.js";

new BrowserWindow({
  title: "Cross Recorder",
  url: "views://mainview/index.html",
  frame: {
    x: 0,
    y: 0,
    width: 900,
    height: 700,
  },
  rpc,
  renderer: "cef",
});
