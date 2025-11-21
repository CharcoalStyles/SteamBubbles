import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";
import SteamStrategyPkg from "passport-steam";

const SteamStrategy = SteamStrategyPkg.Strategy;

const app = express();

/* ------------------------- ENV + FALLBACKS ------------------------- */
const BACKEND_URL =
  process.env.BACKEND_URL || "https://steambubbles.onrender.com";

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || FRONTEND_URL;

const STEAM_API_KEY =
  process.env.STEAM_API_KEY || process.env.STEAM_KEY; // allow old name too

const STEAM_RETURN_URL =
  process.env.STEAM_RETURN_URL || `${BACKEND_URL}/auth/steam/return`;

const STEAM_REALM =
  process.env.STEAM_REALM || `${BACKEND_URL}/`;

console.log("BACKEND_URL      =", BACKEND_URL);
console.log("FRONTEND_URL     =", FRONTEND_URL);
console.log("CLIENT_ORIGIN    =", CLIENT_ORIGIN);
console.log("STEAM_REALM      =", STEAM_REALM);
console.log("STEAM_RETURN_URL =", STEAM_RETURN_URL);

/* ------------------------- MIDDLEWARE ------------------------- */
app.set("trust proxy", 1);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "none",
      secure: true, // required for cross-site cookies on Render HTTPS
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

/* ------------------------- PASSPORT STEAM ------------------------- */
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new SteamStrategy(
    {
      returnURL: STEAM_RETURN_URL,
      realm: STEAM_REALM,
      apiKey: STEAM_API_KEY,
    },
    function verify(identifier, profile, done) {
      const user = {
        steamid: profile.id,
        displayName: profile.displayName,
        avatar: profile.photos?.[2]?.value || profile.photos?.[0]?.value,
      };
      return done(null, user);
    }
  )
);

/* ------------------------- BASIC ROUTES ------------------------- */
app.get("/", (req, res) => {
  res.send("SteamBubbles backend is running. Try /api/me or /api/owned-games");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ------------------------- AUTH ROUTES ------------------------- */
app.get("/auth/steam", passport.authenticate("steam"));

app.get(
  "/auth/steam/return",
  passport.authenticate("steam", { failureRedirect: FRONTEND_URL }),
  (req, res) => res.redirect(FRONTEND_URL)
);

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => res.redirect(FRONTEND_URL));
  });
});

/* ------------------------- API ROUTES ------------------------- */

// Who am I?
app.get("/api/me", (req, res) => {
  if (!req.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.user });
});

// Get games for currently logged-in user
app.get("/api/owned-games", async (req, res) => {
  try {
    if (!req.user?.steamid) {
      return res.status(401).json({ error: "Not logged in" });
    }
    const steamid = req.user.steamid;

    const url =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
      `?key=${STEAM_API_KEY}` +
      `&steamid=${steamid}` +
      `&include_appinfo=1` +
      `&include_played_free_games=1` +
      `&format=json`;

    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch owned games" });
  }
});

// Batch app details (genres, name, etc.)
app.post("/api/appdetails-batch", async (req, res) => {
  try {
    const appids = req.body?.appids;
    if (!Array.isArray(appids) || appids.length === 0) {
      return res.status(400).json({ error: "appids must be a non-empty array" });
    }

    const out = {};
    const limited = appids.slice(0, 250); // avoid huge spam

    await Promise.all(
      limited.map(async (appid) => {
        try {
          const r = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${appid}`
          );
          const j = await r.json();
          const data = j?.[appid]?.data;

          if (!data) return;

          out[appid] = {
            name: data.name,
            genres: (data.genres || []).map((g) => g.description),
            header_image: data.header_image,
          };
        } catch {
          // ignore single failures
        }
      })
    );

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch app details" });
  }
});

/* ------------------------- START SERVER ------------------------- */
const PORT = process.env.PORT || 5174;
app.listen(PORT, () => console.log("API on port", PORT));
