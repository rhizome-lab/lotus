import { gameStore } from "../store/game";
import DigPanel from "./DigPanel";
import Popover from "./Popover";

export default function Compass() {
  const getExit = (dir: string) => {
    const roomId = gameStore.state.roomId;
    if (!roomId) return null;
    const room = gameStore.state.entities.get(roomId);
    if (!room || !Array.isArray(room["exits"])) return null;

    return (room["exits"] as number[])
      .map((id) => gameStore.state.entities.get(id))
      .find((item) => item && (item["name"] as string).toLowerCase() === dir.toLowerCase());
  };

  const handleDir = (dir: string) => {
    const exit = getExit(dir);
    if (exit) {
      gameStore.execute("go", [dir]);
    }
  };

  const Cell = (props: { dir: string; label: string }) => {
    const exit = () => getExit(props.dir);
    return (
      <Popover
        contentClass="compass__popover"
        triggerWrapperStyle={{ width: "100%", height: "100%" }}
        trigger={(triggerProps) => (
          <button
            onClick={(e) => {
              if (exit()) {
                handleDir(props.dir);
              } else {
                triggerProps.onClick(e);
              }
            }}
            classList={{
              compass__cell: true,
              "compass__cell--active": !!exit(),
            }}
          >
            <div class="compass__cell-label">{props.label}</div>
            <div
              classList={{
                "compass__cell-dest": true,
                "compass__cell-dest--active": !!exit(),
              }}
            >
              {exit() ? ((exit()?.["destination_name"] ?? exit()?.["name"]) as string) : "+"}
            </div>
          </button>
        )}
      >
        {(popoverProps) => (
          <div class="compass__builder-wrapper">
            <DigPanel
              initialDirection={props.dir}
              isLocked={true}
              variant="compass"
              onClose={popoverProps.close}
            />
          </div>
        )}
      </Popover>
    );
  };

  return (
    <div class="compass">
      <Cell dir="northwest" label="NW" />
      <Cell dir="north" label="N" />
      <Cell dir="northeast" label="NE" />

      <Cell dir="west" label="W" />
      <div class="compass__center">Here</div>
      <Cell dir="east" label="E" />

      <Cell dir="southwest" label="SW" />
      <Cell dir="south" label="S" />
      <Cell dir="southeast" label="SE" />
    </div>
  );
}
