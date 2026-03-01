import { ApplicationMenu, BrowserWindow } from "electrobun/bun";
import { rpc } from "./rpc.js";
import * as UpdateService from "./services/UpdateService.js";

ApplicationMenu.setApplicationMenu([
  {
    submenu: [{ label: "Quit Cross Recorder", role: "quit" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
]);

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

UpdateService.init((payload) => {
  rpc.send.updateStatus(payload);
});
