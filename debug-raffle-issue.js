// Debug script to understand the raffle userTickets issue

console.log(`
🔍 RAFFLE API DEBUG ANALYSIS

Based on the code review, here are the potential issues with userTickets showing as 0:

## Issue 1: Authentication Flow
The GET /raffle/current endpoint does NOT require authentication (no requireAuth middleware), 
but it tries to access req.user to show user-specific ticket counts.

This means:
- If user includes Authorization: Bearer <token> header → req.user should be populated
- If user doesn't include auth header → req.user will be undefined
- The code should handle both cases gracefully

## Issue 2: User Participation Lookup Logic
In getCurrentRaffle function (lines 19-29):

\`\`\`javascript
if ((req as any).user?._id) {
  const userTickets = await RaffleTicket.find({
    userId: (req as any).user._id,
    drawId: { $in: activeDraws.map(draw => draw._id) }
  }).select('drawId coinBalance');

  userParticipation = userTickets.reduce((acc, ticket) => {
    acc[ticket.drawId.toString()] = { tickets: ticket.coinBalance };
    return acc;
  }, {} as Record<string, { tickets: number }>);
}
\`\`\`

This logic:
✅ Correctly checks if user is authenticated
✅ Looks up RaffleTicket records for the user
✅ Maps tickets by drawId

## Issue 3: User Tickets Assignment (line 62)
\`\`\`javascript
userTickets: userParticipation[draw._id.toString()]?.tickets || 0,
\`\`\`

This should work correctly if userParticipation is properly populated.

## Issue 4: Opt-in Logic
In optInToRaffle function, when a user opts in:
- Creates RaffleTicket with userId and coinBalance
- But the ticket has ticketStart: 0, ticketEnd: balance - 1

## Potential Root Causes:

1. **Missing Authentication**: Frontend not sending Authorization header
2. **Token Issues**: JWT token is invalid/expired
3. **User ID Mismatch**: User ID in token doesn't match user ID in tickets
4. **Database Query Issues**: RaffleTicket.find() not finding user's tickets
5. **Data Type Issues**: ObjectId vs string comparison problems

## To Debug:

1. Check network requests in browser dev tools:
   - Is Authorization header included in GET /raffle/current?
   - What does the response look like?

2. Check console logs for authentication errors

3. Verify that POST /raffle/opt-in actually creates tickets:
   - Check the response from opt-in endpoint
   - Verify database has RaffleTicket records

4. Check if user ID in JWT token matches user ID in database

## Browser Debug Steps:

1. Open Network tab in dev tools
2. Look at GET /raffle/current request:
   - Request headers: Authorization: Bearer <token>
   - Response: userTickets field value
3. Look at POST /raffle/opt-in request:
   - Request headers: Authorization: Bearer <token>
   - Request body: { drawId: "..." }
   - Response: { success: true, tickets: X }
4. Look at subsequent GET /raffle/current:
   - Should show userTickets: X (same as opt-in response)

## Expected Behavior:
- Before opt-in: userTickets: 0
- After opt-in: userTickets: <user's coin balance>
- totalTickets should increase by user's coin balance
`);