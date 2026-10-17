// Shared only for the optimistic Proxy check. Authorization always validates the DB session.
export const sessionCookieName = process.env.NODE_ENV === "production" ? "__Host-hearthline_session" : "hearthline_session";
