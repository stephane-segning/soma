import {Outlet} from "react-router";
import {CommandPaletteShell} from "../../components/command-palette";
import {RouterListener} from "@renderer/components/router-listener";

function Component(): React.JSX.Element {
  const sendPing = (): void => window.electron.ipcRenderer.send("ping");

  return (
    <div className="min-h-dvh w-full bg-base-200 text-base-content">
      <Outlet/>
      <CommandPaletteShell onSendIpc={sendPing}/>
      <RouterListener />
    </div>
  );
}

export {Component};
