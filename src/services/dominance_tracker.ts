import moveBadgeConfig from '../config/move_badges';

type State = { streak: number };

class DominanceTracker {
  private map = new Map<string, State>();

  /** Update dominated streak for a game and return whether persistence threshold is met. */
  update(gameId: string, dominatedNow: boolean): boolean {
    const minPlies = moveBadgeConfig.dominated.minPersistencePlies || 1;
    const cur = this.map.get(gameId) || { streak: 0 };
    const streak = dominatedNow ? (cur.streak + 1) : 0;
    this.map.set(gameId, { streak });
    return dominatedNow && streak >= minPlies;
  }

  reset(gameId: string) {
    this.map.delete(gameId);
  }
}

export const dominanceTracker = new DominanceTracker();
export default dominanceTracker;

