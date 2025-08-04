// components/power-table/PowerTable.tsx
'use client';
import React, { useState } from 'react';
import type { PowerDataGroup } from '../../lib/parsePowerData';

interface PowerTableProps {
  groups: PowerDataGroup[];
}

export default function PowerTable({ groups }: PowerTableProps) {
  const [page, setPage] = useState(0);
  const group = groups[page];
  if (!group) return <div className="text-red-400">데이터 없음</div>;

  return (
    <div className="w-full h-full bg-[#181A20] rounded-lg shadow-md p-2" style={{ 
      width: '100%', 
      height: '100%',
      display: 'grid',
      gridTemplateRows: '50px 420px 50px',
      gridTemplateAreas: '"header" "table" "pagination"',
      gap: '10px'
    }}>
      {/* 상단 정보 - 한 줄에 배치 */}
      <div className="flex items-center justify-between px-2" style={{ 
        display: 'flex', 
        flexWrap: 'nowrap', 
        gap: '40px', 
        gridArea: 'header',
        backgroundColor: '#23242a',
        borderRadius: '8px',
        padding: '10px'
      }}>
        <div className="text-lg font-semibold text-blue-200">날짜: <span className="text-white">{group.date}</span></div>
        <div className="text-lg font-semibold text-blue-200">시간: <span className="text-white">{group.time}</span></div>
        <div className="text-lg font-semibold text-blue-200">온도: <span className="text-white">{group.temperature}°C</span></div>
      </div>
      
      {/* 테이블 컨테이너 - 그리드 영역 */}
      <div className="overflow-x-auto" style={{ 
        width: '100%', 
        gridArea: 'table',
        backgroundColor: '#1a1b20',
        borderRadius: '8px',
        padding: '10px'
      }}>
        <table className="w-full text-xs sm:text-sm md:text-base text-left text-gray-300 border-separate border-spacing-0" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#23242a]">
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '20px' }}>입력</th>
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '20px' }}>출력</th>
              {Array.from({ length: 10 }, (_, i) => (
                <th key={i} className="px-1 py-0" style={{ width: '6%', fontSize: '20px' }}>dev{String(i+1).padStart(2,'0')}</th>
              ))}
              <th className="px-1 py-0" style={{ width: '8%', fontSize: '20px' }}>GOOD</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#3a3a3a' : '#1a1a1a' }}>
                <td className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>{row.input}</td>
                <td className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>{row.output}</td>
                {row.devs.map((v, i) => (
                  <td key={i} className="px-1 py-0 whitespace-nowrap text-right" style={{ fontSize: '18px' }}>{v}</td>
                ))}
                <td className="px-1 py-0 whitespace-nowrap text-center" style={{ fontSize: '18px' }}>{row.good}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* 페이지네이션 - 그리드 영역 */}
      <div className="flex justify-center items-center gap-2" style={{ 
        gridArea: 'pagination',
        backgroundColor: '#2a2b30',
        borderRadius: '8px',
        padding: '10px',
        borderTop: '2px solid #404040'
      }}>
        {groups.map((_, i) => (
          <button
            key={i}
            style={{ width: 40, height: 30, fontSize: '14px' }}
            className={`rounded-full flex items-center justify-center font-bold border border-gray-600 transition-colors ${i === page ? 'bg-blue-500 text-white' : 'bg-[#53545a] text-gray-300 hover:bg-blue-700'}`}
            onClick={() => setPage(i)}
            aria-current={i === page ? 'page' : undefined}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
} 