import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export async function saveValues<T>(filePath: string, key: string, value: T): Promise<void> {
  try {
    let data: Record<string, unknown> = {};
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      data = JSON.parse(fileContent);
    } catch (e) {
      // file doesn't exist or is invalid JSON
    }
    
    data[key] = value;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${key} in ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`Failed to save ${key} in ${path.basename(filePath)}:`, err);
  }
}

export async function loadValues<T>(filePath: string): Promise<T> {
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return data as T;
  } catch (err) {
    console.error(`Failed to load from ${path.basename(filePath)}:`, err);
    return {} as T;
  }
}

export function loadValuesSync<T>(filePath: string): T {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf8')) as T;
    }
    return {} as T;
  } catch (err) {
    console.error(`Failed to load sync from ${path.basename(filePath)}:`, err);
    return {} as T;
  }
}

export async function saveFileValues<T>(filePath: string, data: T): Promise<void> {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save to ${path.basename(filePath)}:`, err);
  }
}

export function saveFileValuesSync<T>(filePath: string, data: T): void {
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save sync to ${path.basename(filePath)}:`, err);
  }
}