import { useState, useRef, useEffect } from "react";
import type { Project } from "@shared/types";

interface ProjectSelectorProps {
  projects: Project[];
  currentProject: Project | null;
  onSelect: (project: Project) => void;
}

export function ProjectSelector({
  projects,
  currentProject,
  onSelect,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showPathInput, setShowPathInput] = useState(false);
  const [pathValue, setPathValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <svg
          className="w-4 h-4"
          style={{ color: "var(--text-tertiary)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <span className="max-w-[150px] truncate" style={{ color: "var(--text-secondary)" }}>
          {currentProject?.name || "Select Project"}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          style={{ color: "var(--text-tertiary)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-2 w-64 max-h-80 overflow-y-auto border rounded-lg shadow-xl z-50"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-primary)",
          }}
        >
          {projects.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No projects found
            </div>
          ) : (
            <div className="py-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    onSelect(project);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left transition-colors"
                  style={
                    currentProject?.id === project.id
                      ? { backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--accent)" }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  <div className="font-medium truncate">{project.name}</div>
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {project.path}
                  </div>
                </button>
              ))}

              {/* Open Folder */}
              <div className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                {!showPathInput ? (
                  <button
                    onClick={() => {
                      setShowPathInput(true);
                      setTimeout(() => pathInputRef.current?.focus(), 50);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2 transition-colors"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span className="text-sm">Open Folder...</span>
                  </button>
                ) : (
                  <form
                    className="px-3 py-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const path = pathValue.trim();
                      if (path) {
                        onSelect({
                          id: btoa(path),
                          name: path.split("/").pop() || path,
                          path,
                        });
                        setIsOpen(false);
                        setShowPathInput(false);
                        setPathValue("");
                      }
                    }}
                  >
                    <input
                      ref={pathInputRef}
                      value={pathValue}
                      onChange={(e) => setPathValue(e.target.value)}
                      placeholder="/path/to/project"
                      className="flex-1 px-2 py-1.5 rounded text-sm outline-none"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-primary)",
                      }}
                    />
                    <button
                      type="submit"
                      className="px-2 py-1.5 rounded text-sm font-medium"
                      style={{ background: "var(--accent)", color: "var(--text-primary)" }}
                    >
                      Open
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
