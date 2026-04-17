import { ProfilePicker } from "./ProfilePicker";
import { ProjectTree } from "./ProjectTree";

export function Sidebar() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <ProjectTree />
      </div>
      <ProfilePicker />
    </div>
  );
}
