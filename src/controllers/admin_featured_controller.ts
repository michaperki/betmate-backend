import { RequestHandler } from 'express';
import featuredSelector from '../services/featured_selector';

export const getFeaturedCandidates: RequestHandler = async (_req, res) => {
  try {
    const data = await featuredSelector.computeFeaturedCandidates();
    // Trim game payload to essential fields to keep payload smaller
    const sanitized = {
      weights: data.weights,
      generated_at: data.generated_at,
      scored: data.scored.map((c) => ({
        id: c.id,
        score: c.score,
        components: c.components,
        summary: c.summary,
        game: {
          id: c.game.id,
          speed: c.game.speed,
          status: c.game.status,
          moves: c.game.moves?.split(' ').length || 0,
          clock: c.game.clock,
          players: {
            white: { id: c.game.players?.white?.user?.id, name: c.game.players?.white?.user?.name, title: c.game.players?.white?.user?.title, rating: c.game.players?.white?.rating },
            black: { id: c.game.players?.black?.user?.id, name: c.game.players?.black?.user?.name, title: c.game.players?.black?.user?.title, rating: c.game.players?.black?.rating },
          },
        },
      }))
    };
    return res.json(sanitized);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to compute featured candidates' });
  }
};

export default { getFeaturedCandidates };

