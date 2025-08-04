// /lib/parsePowerData.ts
import { promises as fs } from 'fs';
import path from 'path';

export interface PowerDataRow {
  date: string;
  time: string;
  temperature: string;
  input: string;
  output: string;
  devs: string[];
  good: string;
}

export interface PowerDataGroup {
  groupIndex: number;
  date: string;
  time: string;
  temperature: string;
  rows: PowerDataRow[];
}

/**
 * /data/data1_1.txt 파일을 파싱하여 조별로 데이터를 반환합니다.
 */
export async function parsePowerDataFile(): Promise<PowerDataGroup[]> {
  const filePath = path.join(process.cwd(), 'data', 'data1_1.txt');
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const groups: PowerDataGroup[] = [];
  let currentRows: PowerDataRow[] = [];
  let groupIndex = 0;
  let date = '';
  let time = '';
  let temperature = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# date')) {
      // 새 그룹 시작
      if (currentRows.length > 0) {
        groups.push({ groupIndex, date, time, temperature, rows: currentRows });
        groupIndex++;
        currentRows = [];
      }
      continue;
    }
    if (!line || line.startsWith('//')) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 15) continue;
    // date, time, temp, input, output, dev01~dev10, good
    const [d, t, temp, input, output, ...rest] = cols;
    const devs = rest.slice(0, 10);
    const good = rest[10] || '';
    // 첫 데이터 행에서 그룹 정보 추출
    if (currentRows.length === 0) {
      date = d;
      time = t;
      temperature = temp;
    }
    currentRows.push({
      date: d,
      time: t,
      temperature: temp,
      input,
      output,
      devs,
      good,
    });
  }
  // 마지막 그룹 추가
  if (currentRows.length > 0) {
    groups.push({ groupIndex, date, time, temperature, rows: currentRows });
  }
  return groups;
} 