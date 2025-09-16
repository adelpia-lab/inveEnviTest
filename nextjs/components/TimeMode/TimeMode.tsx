'use client';

import React, { useState } from 'react';

const TimeMode = ({ onSave, onCancel }) => {
  const [timeValues, setTimeValues] = useState({
    T1: '',
    T2: '',
    T3: '',
    T4: '',
    T5: '',
    T6: '',
    T7: '',
    T8: ''
  });

  const handleInputChange = (key, value) => {
    setTimeValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    onSave(timeValues);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="w-full h-[600px] relative bg-white">
      {/* Main container with fixed width */}
      <div className="w-[1024px] h-[600px] relative mx-auto">
        
        {/* Graph Background */}
        <div className="absolute left-[50px] top-[50px] w-[924px] h-[300px] bg-gray-100 border border-gray-300">
          
          {/* Vertical Grid Lines */}
          <div className="absolute left-0 top-0 w-full h-full">
            {/* T1 vertical line */}
            <div className="absolute left-[0%] top-0 w-px h-full bg-black"></div>
            {/* T2 vertical line */}
            <div className="absolute left-[12.5%] top-0 w-px h-full bg-black"></div>
            {/* T3 vertical line */}
            <div className="absolute left-[25%] top-0 w-px h-full bg-black"></div>
            {/* T4 vertical line */}
            <div className="absolute left-[37.5%] top-0 w-px h-full bg-black"></div>
            {/* T5 vertical line */}
            <div className="absolute left-[50%] top-0 w-px h-full bg-black"></div>
            {/* T6 vertical line */}
            <div className="absolute left-[62.5%] top-0 w-px h-full bg-black"></div>
            {/* T7 vertical line */}
            <div className="absolute left-[75%] top-0 w-px h-full bg-black"></div>
            {/* T8 vertical line */}
            <div className="absolute left-[87.5%] top-0 w-px h-full bg-black"></div>
            {/* End vertical line */}
            <div className="absolute left-[100%] top-0 w-px h-full bg-black"></div>
          </div>

          {/* Horizontal Temperature Lines */}
          <div className="absolute left-0 top-0 w-full h-full">
            {/* High Temperature Line */}
            <div className="absolute left-0 top-[25%] w-full h-px bg-black"></div>
            {/* Medium Temperature Line */}
            <div className="absolute left-0 top-[50%] w-full h-px bg-black"></div>
            {/* Low Temperature Line */}
            <div className="absolute left-0 top-[75%] w-full h-px bg-black"></div>
          </div>

          {/* Temperature Labels */}
          <div className="absolute -left-[40px] top-[20%] text-sm font-bold">고온</div>
          <div className="absolute -left-[40px] top-[45%] text-sm font-bold">상온</div>
          <div className="absolute -left-[40px] top-[70%] text-sm font-bold">저온</div>

          {/* Temperature Curve (Blue Line) */}
          <svg className="absolute left-0 top-0 w-full h-full" viewBox="0 0 924 300">
            <path
              d="M 0 150 
                 L 115 150 
                 L 115 75 
                 L 230 75 
                 L 230 225 
                 L 345 225 
                 L 345 75 
                 L 460 75 
                 L 460 225 
                 L 575 225 
                 L 575 150 
                 L 690 150 
                 L 690 225 
                 L 805 225 
                 L 805 150 
                 L 924 150"
              stroke="#0066CC"
              strokeWidth="4"
              fill="none"
            />
          </svg>

          {/* T Labels */}
          <div className="absolute left-[6.25%] top-[310px] text-sm font-bold">T1</div>
          <div className="absolute left-[18.75%] top-[310px] text-sm font-bold">T2</div>
          <div className="absolute left-[31.25%] top-[310px] text-sm font-bold">T3</div>
          <div className="absolute left-[43.75%] top-[310px] text-sm font-bold">T4</div>
          <div className="absolute left-[56.25%] top-[310px] text-sm font-bold">T5</div>
          <div className="absolute left-[68.75%] top-[310px] text-sm font-bold">T6</div>
          <div className="absolute left-[81.25%] top-[310px] text-sm font-bold">T7</div>
          <div className="absolute left-[93.75%] top-[310px] text-sm font-bold">T8</div>

          {/* Input Fields */}
          <div className="absolute left-[2%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T1}
              onChange={(e) => handleInputChange('T1', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[14.5%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T2}
              onChange={(e) => handleInputChange('T2', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[27%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T3}
              onChange={(e) => handleInputChange('T3', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[39.5%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T4}
              onChange={(e) => handleInputChange('T4', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[52%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T5}
              onChange={(e) => handleInputChange('T5', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[64.5%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T6}
              onChange={(e) => handleInputChange('T6', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[77%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T7}
              onChange={(e) => handleInputChange('T7', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
          <div className="absolute left-[89.5%] top-[330px] w-[8%] h-[25px]">
            <input
              type="text"
              value={timeValues.T8}
              onChange={(e) => handleInputChange('T8', e.target.value)}
              className="w-full h-full border border-gray-300 rounded px-2 text-sm"
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="absolute left-[50px] top-[420px] text-lg">
          <ul className="list-disc ml-8">
            <li>T1~T7 분단위 입력</li>
            <li>Timer Mode로 동작할 때만 적용된다.</li>
          </ul>
        </div>

        {/* Title */}
        <div className="absolute left-[50px] top-[480px] text-2xl font-bold">
          Timer Mode 구간별 시간(min) 분단위 입력
        </div>

        {/* Buttons */}
        <div className="absolute right-[50px] bottom-[50px] flex gap-4">
          <button
            onClick={handleCancel}
            className="px-6 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50"
          >
            CANCEL
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeMode;