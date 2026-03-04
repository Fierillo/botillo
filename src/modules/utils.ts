import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export async function saveValues(filePath: string, key: string, value: any) {
  try {
    let data: any = {};
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

export async function loadValues(filePath: string): Promise<any> {
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return data;
  } catch (err) {
    console.error(`Failed to load from ${path.basename(filePath)}:`, err);
    return {};
  }
}

export function loadValuesSync(filePath: string): any {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    }
    return {};
  } catch (err) {
    console.error(`Failed to load sync from ${path.basename(filePath)}:`, err);
    return {};
  }
}

export async function saveFileValues(filePath: string, data: any) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save to ${path.basename(filePath)}:`, err);
  }
}

export function saveFileValuesSync(filePath: string, data: any) {
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save sync to ${path.basename(filePath)}:`, err);
  }
}