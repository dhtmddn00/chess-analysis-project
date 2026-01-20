'use client';

import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface StyleScoresChartProps {
  styleScores: Record<string, any>;
}

export default function StyleScoresChart({ styleScores }: StyleScoresChartProps) {
  const chartRef = useRef<ChartJS<'radar'> | null>(null);

  // Map common style dimensions to user-friendly labels
  const dimensionLabels: Record<string, string> = {
    aggressive: 'Aggressive',
    tactical: 'Tactical',
    positional: 'Positional',
    strategic: 'Strategic',
    defensive: 'Defensive',
    endgame: 'Endgame',
    opening: 'Opening',
    middlegame: 'Middlegame',
    calculation: 'Calculation',
    intuition: 'Intuitive',
    patient: 'Patient',
    dynamic: 'Dynamic'
  };

  // Extract and normalize style scores
  const getStyleData = () => {
    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColors: string[] = [];
    const borderColors: string[] = [];

    // Color palette for different dimensions
    const colors = [
      { bg: 'rgba(54, 162, 235, 0.2)', border: 'rgba(54, 162, 235, 1)' },
      { bg: 'rgba(255, 99, 132, 0.2)', border: 'rgba(255, 99, 132, 1)' },
      { bg: 'rgba(75, 192, 192, 0.2)', border: 'rgba(75, 192, 192, 1)' },
      { bg: 'rgba(153, 102, 255, 0.2)', border: 'rgba(153, 102, 255, 1)' },
      { bg: 'rgba(255, 159, 64, 0.2)', border: 'rgba(255, 159, 64, 1)' },
      { bg: 'rgba(255, 205, 86, 0.2)', border: 'rgba(255, 205, 86, 1)' },
    ];

    Object.entries(styleScores).forEach(([key, value], index) => {
      // Skip non-numeric values or metadata
      if (typeof value === 'number' && value >= 0 && value <= 100) {
        labels.push(dimensionLabels[key.toLowerCase()] || key.replace(/_/g, ' '));
        data.push(value);
        
        const colorIndex = index % colors.length;
        backgroundColors.push(colors[colorIndex].bg);
        borderColors.push(colors[colorIndex].border);
      }
    });

    return { labels, data, backgroundColors, borderColors };
  };

  const styleData = getStyleData();

  if (styleData.labels.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">
          No style analysis data available
        </p>
      </div>
    );
  }

  const chartData = {
    labels: styleData.labels,
    datasets: [
      {
        label: 'Style Scores',
        data: styleData.data,
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(54, 162, 235, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(54, 162, 235, 1)',
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.label}: ${Math.round(context.parsed.r)}%`;
          }
        }
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 100,
        min: 0,
        ticks: {
          stepSize: 20,
          color: 'rgba(156, 163, 175, 0.8)',
          font: {
            size: 11
          }
        },
        grid: {
          color: 'rgba(156, 163, 175, 0.3)',
        },
        angleLines: {
          color: 'rgba(156, 163, 175, 0.3)',
        },
        pointLabels: {
          color: 'rgba(55, 65, 81, 1)',
          font: {
            size: 12,
            weight: 500
          }
        }
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="h-96 relative">
        <Radar ref={chartRef} data={chartData} options={options} />
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {styleData.labels.map((label, index) => {
          const score = styleData.data[index];
          const percentage = Math.round(score);
          
          const getScoreColor = (score: number) => {
            if (score >= 80) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
            if (score >= 60) return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
            if (score >= 40) return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20';
            return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
          };

          const getScoreDescription = (score: number) => {
            if (score >= 80) return 'Excellent';
            if (score >= 60) return 'Good';
            if (score >= 40) return 'Average';
            return 'Needs Work';
          };

          return (
            <div key={label} className={`p-4 rounded-lg border ${getScoreColor(score)}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">{label}</h4>
                <span className="text-2xl font-bold">{percentage}%</span>
              </div>
              <p className="text-xs opacity-75">
                {getScoreDescription(score)}
              </p>
              
              {/* Mini progress bar */}
              <div className="w-full bg-black/10 rounded-full h-1.5 mt-2">
                <div
                  className="bg-current h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Analysis Summary */}
      <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
          Style Analysis Summary
        </h4>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <strong>Strongest area:</strong>{' '}
            {styleData.labels[styleData.data.indexOf(Math.max(...styleData.data))]} 
            ({Math.round(Math.max(...styleData.data))}%)
          </p>
          <p>
            <strong>Area for improvement:</strong>{' '}
            {styleData.labels[styleData.data.indexOf(Math.min(...styleData.data))]}
            ({Math.round(Math.min(...styleData.data))}%)
          </p>
          <p>
            <strong>Overall balance:</strong>{' '}
            {Math.round(styleData.data.reduce((a, b) => a + b, 0) / styleData.data.length)}% average
          </p>
        </div>
      </div>
    </div>
  );
}