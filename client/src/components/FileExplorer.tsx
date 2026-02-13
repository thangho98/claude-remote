import { useState } from "react";
import type { FileNode } from "@shared/types";

interface FileExplorerProps {
  tree: FileNode | null;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
}

export function FileExplorer({
  tree,
  onFileSelect,
  selectedPath,
}: FileExplorerProps) {
  if (!tree) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>No project selected</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2">
      {tree.type === "directory" && tree.children ? (
        // VS Code style: render children directly without showing root folder
        tree.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={0}
            onFileSelect={onFileSelect}
            selectedPath={selectedPath}
          />
        ))
      ) : (
        // Single file case
        <FileTreeNode
          node={tree}
          depth={0}
          onFileSelect={onFileSelect}
          selectedPath={selectedPath}
        />
      )}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
}

function FileTreeNode({
  node,
  depth,
  onFileSelect,
  selectedPath,
}: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (node.type === "directory") {
      setIsOpen(!isOpen);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-gray-700/50 transition-colors ${
          isSelected ? "bg-orange-600/30 text-orange-300" : "text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "directory" ? (
          <>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <svg
              className="w-4 h-4 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileIcon filename={node.name} />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === "directory" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// File icon mapping with VS Code-like colors and specific icons
const FILE_ICONS: Record<string, { color: string; icon: string }> = {
  // TypeScript
  ts: { color: "text-blue-500", icon: "TS" },
  tsx: { color: "text-blue-400", icon: "TSX" },
  // JavaScript
  js: { color: "text-yellow-400", icon: "JS" },
  jsx: { color: "text-yellow-300", icon: "JSX" },
  mjs: { color: "text-yellow-400", icon: "JS" },
  cjs: { color: "text-yellow-400", icon: "JS" },
  // JSON & Config
  json: { color: "text-orange-400", icon: "JSON" },
  yaml: { color: "text-red-400", icon: "YAML" },
  yml: { color: "text-red-400", icon: "YAML" },
  toml: { color: "text-gray-400", icon: "TOML" },
  ini: { color: "text-gray-400", icon: "INI" },
  // Markdown
  md: { color: "text-blue-300", icon: "MD" },
  mdx: { color: "text-yellow-300", icon: "MDX" },
  // Styles
  css: { color: "text-blue-400", icon: "CSS" },
  scss: { color: "text-pink-400", icon: "SCSS" },
  sass: { color: "text-pink-400", icon: "SASS" },
  less: { color: "text-blue-300", icon: "LESS" },
  stylus: { color: "text-green-300", icon: "STYL" },
  // HTML
  html: { color: "text-orange-500", icon: "HTML" },
  htm: { color: "text-orange-500", icon: "HTML" },
  // Images
  svg: { color: "text-orange-300", icon: "SVG" },
  png: { color: "text-green-400", icon: "IMG" },
  jpg: { color: "text-green-400", icon: "IMG" },
  jpeg: { color: "text-green-400", icon: "IMG" },
  gif: { color: "text-green-400", icon: "IMG" },
  webp: { color: "text-green-400", icon: "IMG" },
  ico: { color: "text-yellow-300", icon: "ICO" },
  // Fonts
  ttf: { color: "text-red-300", icon: "FONT" },
  otf: { color: "text-red-300", icon: "FONT" },
  woff: { color: "text-red-300", icon: "FONT" },
  woff2: { color: "text-red-300", icon: "FONT" },
  // Python
  py: { color: "text-yellow-300", icon: "PY" },
  pyc: { color: "text-gray-400", icon: "PYC" },
  // Rust
  rs: { color: "text-orange-400", icon: "RS" },
  // Go
  go: { color: "text-cyan-400", icon: "GO" },
  // Java
  java: { color: "text-red-500", icon: "JAVA" },
  class: { color: "text-blue-400", icon: "CLASS" },
  jar: { color: "text-red-400", icon: "JAR" },
  // C/C++
  c: { color: "text-blue-500", icon: "C" },
  cpp: { color: "text-blue-400", icon: "CPP" },
  h: { color: "text-purple-400", icon: "H" },
  hpp: { color: "text-purple-400", icon: "HPP" },
  // C#
  cs: { color: "text-green-400", icon: "CS" },
  // PHP
  php: { color: "text-purple-400", icon: "PHP" },
  // Ruby
  rb: { color: "text-red-500", icon: "RB" },
  // Shell
  sh: { color: "text-green-300", icon: "SH" },
  bash: { color: "text-green-300", icon: "BASH" },
  zsh: { color: "text-green-300", icon: "ZSH" },
  fish: { color: "text-green-300", icon: "FISH" },
  ps1: { color: "text-blue-400", icon: "PS" },
  // SQL
  sql: { color: "text-gray-300", icon: "SQL" },
  // GraphQL
  graphql: { color: "text-pink-400", icon: "GQL" },
  gql: { color: "text-pink-400", icon: "GQL" },
  // Docker
  dockerfile: { color: "text-blue-500", icon: "DOCKER" },
  // Git
  gitignore: { color: "text-red-400", icon: "GIT" },
  gitattributes: { color: "text-red-400", icon: "GIT" },
  // Lock files
  lock: { color: "text-yellow-500", icon: "LOCK" },
  // Env
  env: { color: "text-yellow-500", icon: "ENV" },
  // Log
  log: { color: "text-gray-400", icon: "LOG" },
  // XML
  xml: { color: "text-orange-400", icon: "XML" },
  // CSV
  csv: { color: "text-green-500", icon: "CSV" },
  // PDF
  pdf: { color: "text-red-500", icon: "PDF" },
  // Zip/Archive
  zip: { color: "text-yellow-500", icon: "ZIP" },
  tar: { color: "text-yellow-500", icon: "TAR" },
  gz: { color: "text-yellow-500", icon: "GZ" },
  rar: { color: "text-yellow-500", icon: "RAR" },
  "7z": { color: "text-yellow-500", icon: "7Z" },
  // Vue
  vue: { color: "text-green-400", icon: "VUE" },
  // Svelte
  svelte: { color: "text-orange-500", icon: "SVELTE" },
  // Swift
  swift: { color: "text-orange-400", icon: "SWIFT" },
  // Kotlin
  kt: { color: "text-purple-400", icon: "KT" },
  kts: { color: "text-purple-400", icon: "KTS" },
  // Dart
  dart: { color: "text-cyan-400", icon: "DART" },
  // Flutter
  flutter: { color: "text-cyan-300", icon: "FLUTTER" },
  // Lua
  lua: { color: "text-blue-500", icon: "LUA" },
  // Perl
  pl: { color: "text-blue-300", icon: "PL" },
  pm: { color: "text-blue-300", icon: "PM" },
  // R
  r: { color: "text-blue-400", icon: "R" },
  // Julia
  jl: { color: "text-purple-500", icon: "JL" },
  // Haskell
  hs: { color: "text-purple-400", icon: "HS" },
  lhs: { color: "text-purple-400", icon: "LHS" },
  // Scala
  scala: { color: "text-red-400", icon: "SCALA" },
  sc: { color: "text-red-400", icon: "SC" },
  // Clojure
  clj: { color: "text-green-400", icon: "CLJ" },
  cljs: { color: "text-green-400", icon: "CLJS" },
  // Elixir
  ex: { color: "text-purple-400", icon: "EX" },
  exs: { color: "text-purple-400", icon: "EXS" },
  // Erlang
  erl: { color: "text-red-300", icon: "ERL" },
  hrl: { color: "text-red-300", icon: "HRL" },
  // OCaml
  ml: { color: "text-orange-400", icon: "ML" },
  mli: { color: "text-yellow-400", icon: "MLI" },
  // F#
  fs: { color: "text-blue-400", icon: "FS" },
  fsi: { color: "text-blue-400", icon: "FSI" },
  fsx: { color: "text-blue-400", icon: "FSX" },
  // Nim
  nim: { color: "text-yellow-400", icon: "NIM" },
  // Zig
  zig: { color: "text-orange-500", icon: "ZIG" },
  // V
  v: { color: "text-blue-400", icon: "V" },
  // Crystal
  cr: { color: "text-gray-300", icon: "CR" },
  // Assembly
  asm: { color: "text-red-400", icon: "ASM" },
  s: { color: "text-red-400", icon: "S" },
  // Makefile
  mk: { color: "text-yellow-500", icon: "MAKE" },
  // CMake
  cmake: { color: "text-green-400", icon: "CMAKE" },
  // Gradle
  gradle: { color: "text-blue-400", icon: "GRADLE" },
  // Maven
  pom: { color: "text-red-400", icon: "POM" },
};

// Special file names (not extensions)
const SPECIAL_FILES: Record<string, { color: string; icon: string }> = {
  ".gitignore": { color: "text-red-400", icon: "GIT" },
  ".gitattributes": { color: "text-red-400", icon: "GIT" },
  ".gitmodules": { color: "text-red-400", icon: "GIT" },
  ".dockerignore": { color: "text-blue-500", icon: "DOCKER" },
  "dockerfile": { color: "text-blue-500", icon: "DOCKER" },
  "docker-compose.yml": { color: "text-blue-500", icon: "DOCKER" },
  "docker-compose.yaml": { color: "text-blue-500", icon: "DOCKER" },
  ".env": { color: "text-yellow-500", icon: "ENV" },
  ".env.local": { color: "text-yellow-500", icon: "ENV" },
  ".env.development": { color: "text-yellow-500", icon: "ENV" },
  ".env.production": { color: "text-yellow-500", icon: "ENV" },
  ".env.test": { color: "text-yellow-500", icon: "ENV" },
  "readme.md": { color: "text-blue-300", icon: "README" },
  "readme": { color: "text-blue-300", icon: "README" },
  "license": { color: "text-yellow-400", icon: "LICENSE" },
  "license.md": { color: "text-yellow-400", icon: "LICENSE" },
  "license.txt": { color: "text-yellow-400", icon: "LICENSE" },
  "makefile": { color: "text-yellow-500", icon: "MAKE" },
  "cmakelists.txt": { color: "text-green-400", icon: "CMAKE" },
  "package.json": { color: "text-green-400", icon: "NODE" },
  "package-lock.json": { color: "text-green-400", icon: "NODE" },
  "yarn.lock": { color: "text-blue-400", icon: "YARN" },
  "pnpm-lock.yaml": { color: "text-orange-400", icon: "PNPM" },
  "bun.lockb": { color: "text-yellow-400", icon: "BUN" },
  "tsconfig.json": { color: "text-blue-400", icon: "TS" },
  "jsconfig.json": { color: "text-yellow-400", icon: "JS" },
  ".eslintrc": { color: "text-purple-400", icon: "ESLINT" },
  ".eslintrc.js": { color: "text-purple-400", icon: "ESLINT" },
  ".eslintrc.json": { color: "text-purple-400", icon: "ESLINT" },
  ".prettierrc": { color: "text-pink-400", icon: "PRETTIER" },
  ".prettierrc.js": { color: "text-pink-400", icon: "PRETTIER" },
  ".prettierrc.json": { color: "text-pink-400", icon: "PRETTIER" },
  "vite.config.ts": { color: "text-purple-400", icon: "VITE" },
  "vite.config.js": { color: "text-purple-400", icon: "VITE" },
  "webpack.config.js": { color: "text-blue-400", icon: "WEBPACK" },
  "rollup.config.js": { color: "text-red-400", icon: "ROLLUP" },
  "rollup.config.ts": { color: "text-red-400", icon: "ROLLUP" },
  "tailwind.config.js": { color: "text-cyan-400", icon: "TAILWIND" },
  "tailwind.config.ts": { color: "text-cyan-400", icon: "TAILWIND" },
  "next.config.js": { color: "text-white", icon: "NEXT" },
  "next.config.ts": { color: "text-white", icon: "NEXT" },
  "next.config.mjs": { color: "text-white", icon: "NEXT" },
  "astro.config.mjs": { color: "text-orange-400", icon: "ASTRO" },
  "svelte.config.js": { color: "text-orange-500", icon: "SVELTE" },
  "nuxt.config.ts": { color: "text-green-400", icon: "NUXT" },
  "nuxt.config.js": { color: "text-green-400", icon: "NUXT" },
  "quasar.config.js": { color: "text-blue-400", icon: "QUASAR" },
  "vue.config.js": { color: "text-green-400", icon: "VUE" },
  "angular.json": { color: "text-red-500", icon: "NG" },
  "gulpfile.js": { color: "text-red-400", icon: "GULP" },
  "gruntfile.js": { color: "text-orange-400", icon: "GRUNT" },
  "jest.config.js": { color: "text-red-600", icon: "JEST" },
  "jest.config.ts": { color: "text-red-600", icon: "JEST" },
  "cypress.json": { color: "text-green-500", icon: "CYPRESS" },
  "playwright.config.ts": { color: "text-green-400", icon: "PW" },
  "playwright.config.js": { color: "text-green-400", icon: "PW" },
  "karma.conf.js": { color: "text-green-400", icon: "KARMA" },
  "babel.config.js": { color: "text-yellow-400", icon: "BABEL" },
  ".babelrc": { color: "text-yellow-400", icon: "BABEL" },
  "postcss.config.js": { color: "text-red-400", icon: "POSTCSS" },
  ".postcssrc": { color: "text-red-400", icon: "POSTCSS" },
  "nginx.conf": { color: "text-green-400", icon: "NGINX" },
  "robots.txt": { color: "text-gray-400", icon: "ROBOTS" },
  "sitemap.xml": { color: "text-yellow-400", icon: "SITEMAP" },
  "manifest.json": { color: "text-purple-400", icon: "MANIFEST" },
  " Cargo.toml": { color: "text-orange-400", icon: "CARGO" },
  "cargo.lock": { color: "text-orange-400", icon: "CARGO" },
  "go.mod": { color: "text-cyan-400", icon: "GO" },
  "go.sum": { color: "text-cyan-400", icon: "GO" },
  "requirements.txt": { color: "text-yellow-300", icon: "PY" },
  "pipfile": { color: "text-yellow-300", icon: "PY" },
  "setup.py": { color: "text-yellow-300", icon: "PY" },
  "pyproject.toml": { color: "text-yellow-300", icon: "PY" },
  "poetry.lock": { color: "text-blue-400", icon: "POETRY" },
  "gemfile": { color: "text-red-500", icon: "RB" },
  "gemfile.lock": { color: "text-red-500", icon: "RB" },
  "rakefile": { color: "text-red-500", icon: "RAKE" },
  "composer.json": { color: "text-purple-400", icon: "PHP" },
  "composer.lock": { color: "text-purple-400", icon: "PHP" },
  "pom.xml": { color: "text-red-400", icon: "MAVEN" },
  "build.gradle": { color: "text-blue-400", icon: "GRADLE" },
  "settings.gradle": { color: "text-blue-400", icon: "GRADLE" },
};

function FileIcon({ filename }: { filename: string }) {
  const lowerName = filename.toLowerCase();
  const ext = lowerName.split(".").pop() || "";

  // Check special files first
  if (SPECIAL_FILES[lowerName]) {
    const { color, icon } = SPECIAL_FILES[lowerName];
    return (
      <div className={`w-4 h-4 ${color} font-bold text-[8px] flex items-center justify-center`}>
        {icon.slice(0, 3)}
      </div>
    );
  }

  // Check by extension
  const fileConfig = FILE_ICONS[ext];
  if (fileConfig) {
    const { color, icon } = fileConfig;
    return (
      <div className={`w-4 h-4 ${color} font-bold text-[8px] flex items-center justify-center`}>
        {icon.slice(0, 3)}
      </div>
    );
  }

  // Default file icon
  return (
    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
