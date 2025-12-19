import fs from 'fs/promises';
import path from 'path';

async function saveValues(filePath: string, key: string, value: any) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    data[key] = value;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${key} in ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`Failed to save ${key} in ${path.basename(filePath)}:`, err);
  }
}

async function loadValues(filePath: string): Promise<any> {
  try {
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return data;
  } catch (err) {
    console.error(`Failed to load from ${path.basename(filePath)}:`, err);
    return {};
  }
}

export { saveValues, loadValues };