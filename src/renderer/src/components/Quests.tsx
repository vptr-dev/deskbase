import { useEffect, useState } from 'react'
import { buyFreeze, buyPotion, claimQuest, drinkPotion, ensureQuests, FREEZE_COST, FREEZE_MAX, POTION_COST, POTION_MAX, POTION_MINUTES, REROLL_COST, rerollQuest, useData } from '../store'
import { questDef, questProgress } from '../lib/quests'
import { Button, Progress } from './ui'
import { Icon } from './Icon'

export function QuestsPanel(): JSX.Element | null {
  const data = useData((d) => d)
  const quests = data.quests
  const gamified = data.settings.gamification
  useEffect(() => { if (gamified) ensureQuests() }, [gamified, quests.date])
  if (!gamified || !quests.list.length) return null
  const claimed = quests.list.filter((q) => q.claimed).length
  return (
    <section className="panel glass quests">
      <div className="panel-head">
        <h3>Daily quests</h3>
        <span className="muted small" title="Claim all quests for a bonus chest">{quests.bonusClaimed ? 'Chest opened' : `🎁 ${claimed}/${quests.list.length}`}</span>
      </div>
      {quests.list.map((q) => {
        const p = questProgress(data, q)
        const ready = p >= q.target && !q.claimed
        return (
          <div key={q.id} className={`quest ${q.claimed ? 'claimed' : ''}`}>
            <span className="quest-icon">{questDef(q.kind).icon}</span>
            <div className="grow min0">
              <div className="row between gap-sm">
                <span className={`ellipsis ${q.claimed ? 'strike' : ''}`}>{q.title}</span>
                <span className="muted small tabular">{q.target > 1 ? `${p}/${q.target}` : ''}</span>
              </div>
              <Progress value={p / q.target} height={4} color={q.claimed ? 'var(--success)' : undefined} />
            </div>
            {q.claimed ? <span className="quest-done"><Icon name="check" size={14} stroke={3} /></span>
              : ready ? <Button small kind="primary" onClick={() => claimQuest(q.id)}>Claim</Button>
              : <>
                {!quests.rerolled && p === 0 && (
                  <button className="icon-btn quest-reroll" title={`Reroll this quest (${REROLL_COST} gold, once a day)`} disabled={data.profile.gold < REROLL_COST} onClick={() => rerollQuest(q.id)}><Icon name="dice" size={14} /></button>
                )}
                <span className="xp-chip">{q.xp} XP</span>
              </>}
          </div>
        )
      })}
    </section>
  )
}

export function ShopPanel(): JSX.Element | null {
  const gold = useData((d) => d.profile.gold)
  const freezes = useData((d) => d.inventory.freezes)
  const gamified = useData((d) => d.settings.gamification)
  const potions = useData((d) => d.inventory.potions)
  const potionUntil = useData((d) => d.inventory.potionUntil)
  const left = usePotionLeft(potionUntil)
  if (!gamified) return null
  return (
    <section className="panel glass">
      <div className="panel-head"><h3>Item shop</h3><span className="muted small row gap-xs"><Icon name="coin" size={13} />{gold}</span></div>
      <div className="shop-item">
        <span className="quest-icon">❄️</span>
        <div className="grow min0">
          <div>Streak freeze</div>
          <div className="muted small">Covers one missed habit day · {freezes}/{FREEZE_MAX} held</div>
        </div>
        <Button small disabled={gold < FREEZE_COST || freezes >= FREEZE_MAX} onClick={buyFreeze}><Icon name="coin" size={13} /> {FREEZE_COST}</Button>
      </div>
      <div className="shop-item">
        <span className="quest-icon">🧪</span>
        <div className="grow min0">
          <div>XP potion</div>
          <div className="muted small">{left > 0 ? `Active · ${formatLeft(left)} left` : `Double XP for ${POTION_MINUTES} minutes`} · {potions}/{POTION_MAX} held</div>
        </div>
        {potions > 0 && left <= 0 && <Button small kind="primary" onClick={drinkPotion}>Drink</Button>}
        <Button small disabled={gold < POTION_COST || potions >= POTION_MAX} onClick={buyPotion}><Icon name="coin" size={13} /> {POTION_COST}</Button>
      </div>
    </section>
  )
}

/** Milliseconds left on an active XP potion, refreshed every 15 s. */
export function usePotionLeft(until: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [until])
  return Math.max(0, until - now)
}

export const formatLeft = (ms: number): string => {
  const m = Math.ceil(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
