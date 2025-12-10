// oxlint-disable-next-line no-unassigned-import
import "../../generated_types";
// oxlint-disable-next-line no-unassigned-import
import "../../plugin_types";

export function room_on_enter() {
  const _mover = std.arg<Entity>(0);
  // Call base logic first?
  // We don't have super() calls easily.
  // But we can manually invoke entity_base_on_enter logic if we knew where it was.
  // For now, let's just do the hotel specific stuff.

  // Update last_occupied on the room
  const _controlCap = get_capability("entity.control", { "*": true }); // Needs global or self cap
  // Actually, room should update itself? Room might not have cap.
  // Manager has cap.
  // Let's assume Room doesn't strictly need to update 'last_occupied' synchronously for Stage 1.
  // Or we can rely on the Manager's fast loop to check contents.

  // Better: Room has a reference to Manager. Notify manager?
  const managerId = this["managed_by"] as number;
  if (managerId) {
    const manager = entity(managerId);
    call(manager, "room_occupied", this.id); // Valid future enhancement
  }
}

export function room_on_leave() {
  const _mover = std.arg<Entity>(0);
  const managerId = this["managed_by"] as number;
  if (managerId) {
    const _manager = entity(managerId);
    // call(manager, "room_vacated", this.id);
  }
}
