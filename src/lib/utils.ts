import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class values into a single string using clsx and tailwind-merge.
 * This utility function helps manage dynamic class names and prevents Tailwind CSS conflicts.
 *
 * @param inputs - Array of class values that can be strings, objects, arrays, etc.
 * @returns A merged string of class names with Tailwind conflicts resolved
 *
 * @example
 * cn("px-2 py-1", condition && "bg-blue-500", { "text-white": isActive })
 * // Returns: "px-2 py-1 bg-blue-500 text-white" (when condition and isActive are true)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 规范化文件路径，确保格式正确
 * 
 * 跨平台兼容：
 * - Windows: 支持驱动器号 (C:/, D:/)
 * - macOS/Linux: 支持绝对路径 (/Users/, /home/)
 * 
 * 修复常见的路径格式问题：
 * - 移除重复的斜杠 (// -> /)
 * - 统一使用正斜杠 (\ -> /)
 * - 保留路径开头的斜杠（Unix绝对路径）
 * 
 * @param path - 原始路径
 * @returns 规范化后的路径
 * 
 * @example
 * // Windows
 * normalizePath("C//Users/test") // "C:/Users/test"
 * normalizePath("C:\\Users\\test") // "C:/Users/test"
 * 
 * // macOS/Linux
 * normalizePath("/Users//test") // "/Users/test"
 * normalizePath("//home/user") // "/home/user"
 */
export function normalizePath(path: string): string {
  if (!path) return path;
  
  // 将所有反斜杠转换为正斜杠（Windows兼容）
  let normalized = path.replace(/\\/g, '/');
  
  // 移除重复的斜杠，但保留开头的单个斜杠（Unix绝对路径）
  normalized = normalized.replace(/\/+/g, '/');
  
  // Windows 驱动器号修复：
  // 1. 修复缺少冒号的情况：C/Users -> C:/Users
  normalized = normalized.replace(/^([A-Za-z])\//, '$1:/');
  
  // 2. 确保已有冒号的格式正确：C:/ 保持不变
  normalized = normalized.replace(/^([A-Za-z]):\//, '$1:/');
  
  return normalized;
}
