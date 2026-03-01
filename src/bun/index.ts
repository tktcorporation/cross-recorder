import { ApplicationMenu, BrowserWindow } from "electrobun/bun";
import { rpc } from "./rpc.js";
import * as UpdateService from "./services/UpdateService.js";

ApplicationMenu.setApplicationMenu([
  {
    label: "Cross Recorder",
    submenu: [
      {
        label: "Quit Cross Recorder",
        role: "quit",
        accelerator: "CommandOrControl+Q",
      },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo", accelerator: "CommandOrControl+Z" },
      { role: "redo", accelerator: "CommandOrControl+Shift+Z" },
      { type: "separator" },
      { role: "cut", accelerator: "CommandOrControl+X" },
      { role: "copy", accelerator: "CommandOrControl+C" },
      { role: "paste", accelerator: "CommandOrControl+V" },
      { role: "selectAll", accelerator: "CommandOrControl+A" },
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
