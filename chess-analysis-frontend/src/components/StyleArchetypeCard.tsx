'use client';

import React, { useRef, useState } from 'react';
import { Download, Share2, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AnalysisResult, StyleNumericKey } from '@/types/analysis';

// ── Archetype definitions ─────────────────────────────────────────────────────

interface Archetype {
  key: string;           // translation key suffix
  piece: string;         // chess piece icon
  color: string;         // bg gradient
  textColor: string;
  barColor: string;      // explicit bg class (avoids runtime string replacement)
  traits: StyleNumericKey[];  // top traits for this archetype
}

const ARCHETYPES: Archetype[] = [
  {
    key: 'Tactician',
    piece: '♞',
    color: 'from-zinc-900 to-zinc-700',
    textColor: 'text-yellow-400',
    barColor: 'bg-yellow-400',
    traits: ['tacticalRating', 'aggressionRating', 'riskTolerance'],
  },
  {
    key: 'Positional',
    piece: '♗',
    color: 'from-zinc-800 to-zinc-600',
    textColor: 'text-blue-300',
    barColor: 'bg-blue-300',
    traits: ['positionalRating', 'consistency', 'timeManagementRating'],
  },
  {
    key: 'Aggressive',
    piece: '♛',
    color: 'from-zinc-900 to-red-900',
    textColor: 'text-red-300',
    barColor: 'bg-red-300',
    traits: ['aggressionRating', 'riskTolerance', 'tacticalRating'],
  },
  {
    key: 'Solid',
    piece: '♜',
    color: 'from-zinc-800 to-zinc-900',
    textColor: 'text-green-400',
    barColor: 'bg-green-400',
    traits: ['consistency', 'swindleResistance', 'timeManagementRating'],
  },
  {
    key: 'Endgame',
    piece: '♔',
    color: 'from-zinc-700 to-zinc-900',
    textColor: 'text-purple-300',
    barColor: 'bg-purple-300',
    traits: ['endgameRating', 'leadConversion', 'positionalRating'],
  },
  {
    key: 'Explorer',
    piece: '♙',
    color: 'from-zinc-800 to-zinc-700',
    textColor: 'text-cyan-300',
    barColor: 'bg-cyan-300',
    traits: ['openingVariety', 'riskTolerance', 'aggressionRating'],
  },
  {
    key: 'Comeback',
    piece: '♚',
    color: 'from-zinc-900 to-zinc-800',
    textColor: 'text-orange-300',
    barColor: 'bg-orange-300',
    traits: ['swindleResistance', 'consistency', 'timeManagementRating'],
  },
  {
    key: 'AllRounder',
    piece: '♕',
    color: 'from-zinc-700 to-zinc-800',
    textColor: 'text-white',
    barColor: 'bg-white',
    traits: ['tacticalRating', 'positionalRating', 'endgameRating'],
  },
];

// Dimension label keys (same as Analyze namespace)
const DIM_I18N: Record<StyleNumericKey, string> = {
  tacticalRating:       'dimTactical',
  positionalRating:     'dimPositional',
  endgameRating:        'dimEndgame',
  timeManagementRating: 'dimTimeManagement',
  aggressionRating:     'dimAggression',
  consistency:          'dimConsistency',
  riskTolerance:        'dimRisk',
  exchangePreference:   'dimExchange',
  openingVariety:       'dimOpeningVariety',
  leadConversion:       'dimLeadConversion',
  swindleResistance:    'dimSwindleResistance',
  blunderTendency:      'dimBlunderTendency',
};

// ── Archetype selection logic ─────────────────────────────────────────────────

function pickArchetype(profile: NonNullable<AnalysisResult['styleProfile']>): Archetype {
  const dims: Record<StyleNumericKey, number> = {
    tacticalRating:       profile.tacticalRating,
    positionalRating:     profile.positionalRating,
    endgameRating:        profile.endgameRating,
    timeManagementRating: profile.timeManagementRating,
    aggressionRating:     profile.aggressionRating,
    consistency:          profile.consistency,
    riskTolerance:        profile.riskTolerance,
    exchangePreference:   profile.exchangePreference,
    openingVariety:       profile.openingVariety,
    leadConversion:       profile.leadConversion,
    swindleResistance:    profile.swindleResistance,
    blunderTendency:      profile.blunderTendency,
  };

  const vals = Object.values(dims);
  const avg  = vals.reduce((s, v) => s + v, 0) / vals.length;
  const max  = Math.max(...vals);

  // All-Rounder: highest dimension is within 1.5 of average
  if (max - avg < 1.5) return ARCHETYPES.find(a => a.key === 'AllRounder')!;

  // Score each archetype by summing its defining traits
  const scores = ARCHETYPES.filter(a => a.key !== 'AllRounder').map(a => ({
    archetype: a,
    score: a.traits.reduce((s, k) => s + (dims[k] ?? 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  return scores[0].archetype;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StyleArchetypeCardProps {
  result: AnalysisResult;
  shortLink: string | null;
  jobId: string;
}

export function StyleArchetypeCard({ result, shortLink: _shortLink, jobId: _jobId }: StyleArchetypeCardProps) {
  const t  = useTranslations('StyleCard');
  const tA = useTranslations('Analyze');

  const cardRef    = useRef<HTMLDivElement>(null);
  const [saving, setSaving]   = useState(false);
  const [copied, setCopied]   = useState(false);

  const profile = result.styleProfile;
  if (!profile) return null;

  const archetype = pickArchetype(profile);
  const topTraits = archetype.traits.slice(0, 3);

  const handleDownload = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    const resets: Array<{ el: HTMLElement; saved: string }> = [];
    try {
      // Pre-resolve oklch colours for html2canvas
      const resolve = (root: HTMLElement) => {
        const cs = window.getComputedStyle(root);
        const saved = `${root.style.backgroundColor}|${root.style.color}|${root.style.borderColor}`;
        root.style.backgroundColor = cs.backgroundColor;
        root.style.color            = cs.color;
        root.style.borderColor      = cs.borderColor;
        resets.push({ el: root, saved });
        for (const child of Array.from(root.children)) resolve(child as HTMLElement);
      };
      resolve(cardRef.current);

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `chess-archetype-${result.username}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      // Restore all inline styles that were overwritten for html2canvas
      for (const { el, saved } of resets) {
        const [bg, color, border] = saved.split('|');
        el.style.backgroundColor = bg;
        el.style.color            = color;
        el.style.borderColor      = border;
      }
      setSaving(false);
    }
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base">♟</span>
        <h4 className="text-sm font-black text-zinc-700 uppercase tracking-widest">{t('archetypeTitle')}</h4>
      </div>
      <p className="text-xs text-zinc-400 mb-4">{t('archetypeSubtitle')}</p>

      {/* Capture target */}
      <div
        ref={cardRef}
        className={`rounded-xl bg-gradient-to-br ${archetype.color} p-6 mb-4`}
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Chess Analysis</p>
            <p className="text-white font-black text-xl">{result.username}</p>
          </div>
          <span className="text-5xl leading-none opacity-90">{archetype.piece}</span>
        </div>

        {/* Archetype name */}
        <div className="mb-5">
          <p className={`text-3xl font-black ${archetype.textColor}`}>
            {t(`archetype${archetype.key}` as Parameters<typeof t>[0])}
          </p>
          <p className="text-sm text-zinc-400 mt-1.5 leading-snug">
            {t(`archetype${archetype.key}Desc` as Parameters<typeof t>[0])}
          </p>
        </div>

        {/* Top 3 traits */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('keyTraits')}</p>
          {topTraits.map((key) => {
            const val = profile[key] as number;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-zinc-300 w-28 flex-shrink-0 truncate">
                  {tA(DIM_I18N[key] as Parameters<typeof tA>[0])}
                </span>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${archetype.barColor}`}
                    style={{ width: `${Math.min(val * 10, 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-black w-8 text-right ${archetype.textColor}`}>
                  {val.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="mt-4 text-right text-xs text-zinc-600">chesslab.kr</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 transition"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t('downloadCard')}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition ${
            copied
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
          }`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          {copied ? t('copied') : t('shareCard')}
        </button>
      </div>
    </div>
  );
}
