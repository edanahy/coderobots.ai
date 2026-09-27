/**
 * ComponentPinDiagram — visual SVG-based pin mapper for external components.
 *
 * Mirrors MpuPinDiagram but for the component side: clicking a pin connects
 * it to the currently-active MPU pin.  Shows which MPU pin each component
 * pin is wired to, and highlights pins that are ready to be connected.
 */
import { useMemo } from 'react';
import { usePinDiagramLayout } from '../hooks/usePinDiagramLayout';
import {
  getPrimaryLabel, trunc, ZOOM,
  SIDE_LABEL_H, SIDE_LABEL_HALF_H, SIDE_LABEL_W, 
  TB_LABEL_W, TB_LABEL_H, TB_NEAR, TB_FAR,
} from '../utils/pinDiagram';
import { getMappingEntries } from '../services/hardwareConfig';
import './MpuPinDiagram.css';

const ComponentPinDiagram = ({
  svgRaw,
  svgUrl,
  pins,
  instanceId,
  mappings,
  activeMpuPinId,
  hoveredMpuPinId,
  mpuPins,
  onPinClick,
  onPinHover,
}) => {
  const {
    resolvedSvgRaw, boardUrl,
    svgRef, lens, setLens, handleMouseMove, lensClipId, contentId,
    boardW, boardH, tbStagger, pinLayout,
    svgW, svgH, boardX, boardY, leftLabelRight, leftLabelX, rightLabelLeft, lensR,
  } = usePinDiagramLayout({ svgRaw, svgUrl, pins });

  const toKey = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

  const componentPinIdByKey = useMemo(() => {
    const byKey = {};
    (pins || []).forEach((pin) => {
      if (pin.id) byKey[toKey(pin.id)] = pin.id;
      if (pin.name) byKey[toKey(pin.name)] = pin.id;
      const primary = getPrimaryLabel(pin);
      if (primary) byKey[toKey(primary)] = pin.id;
    });
    return byKey;
  }, [pins]);

  const mpuPinByKey = useMemo(() => {
    const byKey = {};
    (mpuPins || []).forEach((pin) => {
      if (pin.id) byKey[toKey(pin.id)] = pin;
      if (pin.name) byKey[toKey(pin.name)] = pin;
      const primary = getPrimaryLabel(pin);
      if (primary) byKey[toKey(primary)] = pin;
    });
    return byKey;
  }, [mpuPins]);

  const resolveMpuPin = (mpuPinRef) => {
    if (!mpuPinRef) return null;
    return mpuPinByKey[toKey(mpuPinRef)] || null;
  };

  const resolveMpuPinId = (mpuPinRef) => {
    const pin = resolveMpuPin(mpuPinRef);
    return pin?.id || mpuPinRef;
  };

  const getMpuPinName = (mpuPinRef) => {
    const pin = resolveMpuPin(mpuPinRef);
    return getPrimaryLabel(pin) || pin?.name || mpuPinRef;
  };

  // Reverse mapping keyed by resolved component pin id.
  // Supports templates that store either pin ids or pin names.
  const mappingByComponentPinId = useMemo(() => {
    const map = {};
    Object.entries(mappings || {}).forEach(([rawMpuPinRef, mappingValue]) => {
      const mappingEntries = getMappingEntries(mappingValue);
      mappingEntries.forEach((mapping) => {
        if (mapping.instanceId !== instanceId) return;
        const rawComponentPinRef = mapping.componentPinId;
        const resolvedComponentPinId =
          componentPinIdByKey[toKey(rawComponentPinRef)] || rawComponentPinRef;
        if (!resolvedComponentPinId) return;

        map[resolvedComponentPinId] = {
          mpuPinId: resolveMpuPinId(rawMpuPinRef),
          mpuPinName: getMpuPinName(rawMpuPinRef),
        };
      });
    });
    return map;
    // resolveMpuPinId/getMpuPinName read only mpuPinByKey (via resolveMpuPin), so it stands in for
    // them: keep it listed even though the body never names it, and don't list the helpers
    // (re-created every render, they'd defeat the memo). activeMpuPinId/hoveredMpuPinId aren't
    // read (harmless extra recomputes). The rule is off for the deps line: if the helpers start
    // reading another value, add that value here by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers derive only from mpuPinByKey, already listed
  }, [mappings, instanceId, componentPinIdByKey, mpuPinByKey, activeMpuPinId, hoveredMpuPinId]);

  if (!resolvedSvgRaw) {
    return <p className="mpu-diagram-placeholder">Loading component diagram…</p>;
  }
  if (!boardW || !boardH) {
    return <p className="mpu-diagram-placeholder">No SVG data available for this component.</p>;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="mpu-pin-diagram"
      xmlns="http://www.w3.org/2000/svg"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setLens(null)}
    >
      {/* ── Content group — also referenced by the magnifier lens ── */}
      <g id={contentId}>
        {boardUrl && (
          <image
            href={boardUrl}
            x={boardX}
            y={boardY}
            width={boardW}
            height={boardH}
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        {(pins || []).map((pin) => {
          const layout = pinLayout[pin.id];
          if (!layout) return null;

          const { cx: pinX, cy: pinY, side } = layout;

          const mapped = mappingByComponentPinId[pin.id];
          const mappedMpuPinId = mapped?.mpuPinId;
          const mappedMpuPinName = mapped?.mpuPinName;
          const isMapped = Boolean(mappedMpuPinId);
          const isCurrentTarget =
            Boolean(activeMpuPinId) &&
            isMapped &&
            mappedMpuPinId === resolveMpuPinId(activeMpuPinId);
          const isHoveredTarget =
            Boolean(hoveredMpuPinId) &&
            isMapped &&
            mappedMpuPinId === resolveMpuPinId(hoveredMpuPinId);
          const isReady = Boolean(activeMpuPinId) && !isMapped && !isCurrentTarget;

          let fillColor, strokeColor, textColor, lineColor, lineW, dotFill;
          if (isCurrentTarget) {
            fillColor = '#dbeafe'; strokeColor = '#3b82f6'; textColor = '#1d4ed8';
            lineColor = '#93c5fd'; lineW = 0.65; dotFill = '#3b82f6';
          } else if (isHoveredTarget) {
            fillColor = '#fef3c7'; strokeColor = '#f59e0b'; textColor = '#92400e';
            lineColor = '#fde68a'; lineW = 0.65; dotFill = '#f59e0b';
          } else if (isMapped) {
            fillColor = '#dcfce7'; strokeColor = '#16a34a'; textColor = '#15803d';
            lineColor = '#86efac'; lineW = 0.65; dotFill = '#16a34a';
          } else if (isReady) {
            fillColor = '#f0f9ff'; strokeColor = '#7dd3fc'; textColor = '#374151';
            lineColor = '#e0f2fe'; lineW = 0.45; dotFill = '#38bdf8';
          } else {
            fillColor = '#f8fafc'; strokeColor = '#cbd5e1'; textColor = '#374151';
            lineColor = '#e2e8f0'; lineW = 0.45; dotFill = '#94a3b8';
          }

          const primary  = getPrimaryLabel(pin);
          const handlers = {
            style: { cursor: activeMpuPinId ? 'pointer' : 'default' },
            onClick: () => activeMpuPinId && onPinClick?.(pin.id),
            onMouseEnter: () => onPinHover?.(pin.id),
            onMouseLeave: () => onPinHover?.(null),
          };

          // ── Left ─────────────────────────────────────────────────────────
          if (side === 'left') {
            const labelY   = pinY - SIDE_LABEL_HALF_H;
            const pinNameX = leftLabelX + SIDE_LABEL_W - 2;
            const mappingX = leftLabelX + 2;

            return (
              <g key={pin.id} {...handlers}>
                <line x1={leftLabelRight} y1={pinY} x2={pinX} y2={pinY} stroke={lineColor} strokeWidth={lineW} />
                <rect x={leftLabelX} y={labelY} width={SIDE_LABEL_W} height={SIDE_LABEL_H} rx="1.3" fill={fillColor} stroke={strokeColor} strokeWidth="0.5" />
                <text x={pinNameX} y={pinY + 0.3} fontSize="2.9" fontWeight="600" fill={textColor} textAnchor="end" dominantBaseline="middle" fontFamily="ui-monospace,monospace">{primary}</text>
                {isCurrentTarget ? (
                  <text x={mappingX} y={pinY + 0.3} fontSize="2.5" fill="#1d4ed8" textAnchor="start" dominantBaseline="middle">● {trunc(getMpuPinName(activeMpuPinId), 9)}</text>
                ) : isMapped ? (
                  <text x={mappingX} y={pinY + 0.3} fontSize="2.6" fill={textColor} textAnchor="start" dominantBaseline="middle">{trunc(mappedMpuPinName, 10)}</text>
                ) : null}
                <circle cx={pinX} cy={pinY} r={1.3} fill={dotFill} stroke="white" strokeWidth="0.4" />
              </g>
            );
          }

          // ── Right ─────────────────────────────────────────────────────────
          if (side === 'right') {
            const labelY   = pinY - SIDE_LABEL_HALF_H;
            const pinNameX = rightLabelLeft + 2;
            const mappingX = rightLabelLeft + SIDE_LABEL_W - 2;

            return (
              <g key={pin.id} {...handlers}>
                <line x1={pinX} y1={pinY} x2={rightLabelLeft} y2={pinY} stroke={lineColor} strokeWidth={lineW} />
                <rect x={rightLabelLeft} y={labelY} width={SIDE_LABEL_W} height={SIDE_LABEL_H} rx="1.3" fill={fillColor} stroke={strokeColor} strokeWidth="0.5" />
                <text x={pinNameX} y={pinY + 0.3} fontSize="2.9" fontWeight="600" fill={textColor} textAnchor="start" dominantBaseline="middle" fontFamily="ui-monospace,monospace">{primary}</text>
                {isCurrentTarget ? (
                  <text x={mappingX} y={pinY + 0.3} fontSize="2.5" fill="#1d4ed8" textAnchor="end" dominantBaseline="middle">{trunc(getMpuPinName(activeMpuPinId), 9)} ●</text>
                ) : isMapped ? (
                  <text x={mappingX} y={pinY + 0.3} fontSize="2.6" fill={textColor} textAnchor="end" dominantBaseline="middle">{trunc(mappedMpuPinName, 10)}</text>
                ) : null}
                <circle cx={pinX} cy={pinY} r={1.3} fill={dotFill} stroke="white" strokeWidth="0.4" />
              </g>
            );
          }

          // ── Top / Bottom ───────────────────────────────────────────────────
          if (side === 'top' || side === 'bottom') {
            const staggerIdx = tbStagger[pin.id] ?? 0;
            const dist       = staggerIdx === 0 ? TB_NEAR : TB_FAR;
            const labelX     = pinX - TB_LABEL_W / 2;
            let labelY, lineY1, lineY2;
            if (side === 'top') {
              labelY = boardY - dist - TB_LABEL_H;
              lineY1 = labelY + TB_LABEL_H;
              lineY2 = pinY;
            } else {
              labelY = boardY + boardH + dist;
              lineY1 = pinY;
              lineY2 = labelY;
            }
            const labelCY = labelY + TB_LABEL_H / 2;

            return (
              <g key={pin.id} {...handlers}>
                <line x1={pinX} y1={lineY1} x2={pinX} y2={lineY2} stroke={lineColor} strokeWidth={lineW} />
                <rect x={labelX} y={labelY} width={TB_LABEL_W} height={TB_LABEL_H} rx="1.2" fill={fillColor} stroke={strokeColor} strokeWidth="0.5" />
                <text x={pinX} y={labelCY + 0.3} fontSize="2.6" fontWeight="600" fill={textColor} textAnchor="middle" dominantBaseline="middle" fontFamily="ui-monospace,monospace">
                  {trunc(primary, 7)}
                </text>
                <circle cx={pinX} cy={pinY} r={1.3} fill={dotFill} stroke="white" strokeWidth="0.4" />
              </g>
            );
          }

          return null;
        })}
      </g>

      {/* ── Magnifier lens — zooms the full content group ── */}
      {lens && (
        <g style={{ pointerEvents: 'none' }}>
          <defs>
            <clipPath id={lensClipId}>
              <circle cx={lens.x} cy={lens.y} r={lensR} />
            </clipPath>
          </defs>
          {/* White background covers the original content beneath the lens */}
          <circle cx={lens.x} cy={lens.y} r={lensR * ZOOM} fill="white" />
          <g
            clipPath={`url(#${lensClipId})`}
            transform={`translate(${lens.x * (1 - ZOOM)},${lens.y * (1 - ZOOM)}) scale(${ZOOM})`}
          >
            <use href={`#${contentId}`} />
          </g>
          <circle cx={lens.x} cy={lens.y} r={lensR * ZOOM} fill="none" stroke="#475569" strokeWidth="1.2" opacity="0.8" />
        </g>
      )}
    </svg>
  );
};

export default ComponentPinDiagram;
