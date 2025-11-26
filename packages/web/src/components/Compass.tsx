import { gameStore } from "../store/game";
import Builder from "./Builder";
import Popover from "./Popover";

export default function Compass() {
  const getExit = (dir: string) => {
    if (!gameStore.state.room) return null;
    return gameStore.state.room.contents.find(
      (c) => c.kind === "EXIT" && c.name.toLowerCase() === dir.toLowerCase(),
    );
  };

  const handleDir = (dir: string) => {
    const exit = getExit(dir);
    if (exit) {
      gameStore.send(["move", dir]);
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
              {exit() ? exit()?.destination_name ?? exit()?.name : "+"}
            </div>
          </button>
        )}
      >
        {(popoverProps) => (
          <div class="compass__builder-wrapper">
            <Builder
              initialDirection={props.dir}
              isLocked={true}
              hideDirection={true}
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
