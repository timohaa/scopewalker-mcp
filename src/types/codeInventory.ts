export interface MethodInfo {
  name: string;
  line: number;
  visibility: "public" | "private" | "protected";
}

export interface InventoryItem {
  name: string;
  type: "class" | "function" | "interface" | "enum" | "constant";
  line: number;
  exported: boolean;
  methods?: MethodInfo[];
}

export interface FileInventory {
  file: string;
  items: InventoryItem[];
}

export interface CodeInventoryResult {
  path: string;
  inventory: FileInventory[];
  summary: {
    total_files: number;
    total_classes: number;
    total_functions: number;
    total_methods: number;
    exported_symbols: number;
  };
}
