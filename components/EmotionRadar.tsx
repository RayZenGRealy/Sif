import React from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { EmotionalState, EmotionType } from '../types';
import { EMOTION_COLORS, EMOTION_DISPLAY_NAMES } from '../constants';

interface Props {
  data: EmotionalState;
  dominantEmotion: EmotionType;
}

export const EmotionRadar: React.FC<Props> = ({ data, dominantEmotion }) => {
  const chartData = Object.keys(data).map((key) => ({
    subject: EMOTION_DISPLAY_NAMES[key as EmotionType] || key,
    A: data[key],
    fullMark: 100,
  }));

  const activeColor = EMOTION_COLORS[dominantEmotion];

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Эмоции SIF"
            dataKey="A"
            stroke={activeColor}
            strokeWidth={2}
            fill={activeColor}
            fillOpacity={0.4}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#e2e8f0' }}
            itemStyle={{ color: activeColor }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};