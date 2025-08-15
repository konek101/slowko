<script context="module" lang="ts">
  import {
    modeData,
    seededRandomInt,
    Stats,
    GameState,
    Settings,
    LetterStates,
    getWordNumber,
    words,
  } from "./utils";
  import Game from "./components/Game.svelte";
  import {
    letterStates,
    settings,
    mode,
    wordLength,
    extraHard,
  } from "./stores";
  import { GameMode } from "./enums";
  import { Toaster } from "./components/widgets";
  import { setContext } from "svelte";

  document.title = "Słówko | Nieskończona gra w zgadywanie słów";
</script>

<script lang="ts">
  //DISCORD INTEGRATION
  import {
    DiscordSDK,
    Events,
    patchUrlMappings,
    type Types,
  } from "@discord/embedded-app-sdk";
  import Multiplayer from "./components/widgets/Multiplayer.svelte";
  import type { LetterState, PlayerData } from "./types";

  let playerData: PlayerData[] = [];
  // Will eventually store the authenticated user's access_token
  // Persisted session container survives HMR via window global
  const discordSession: {
    auth: any;
    accessToken?: string;
    instanceId?: string;
  } =
    (window as any).__discordSession ||
    ((window as any).__discordSession = {
      auth: null,
      accessToken: undefined,
      instanceId: (window as any).__discordInstanceId,
    });
  let auth: any = discordSession.auth; // local reference (kept in sync after authenticate)
  let discordSdk: DiscordSDK;
  let instanceID: string = discordSession.instanceId;

  // Use env var if provided, fall back to hard-coded ID
  const DISCORD_CLIENT_ID =
    import.meta.env.VITE_DISCORD_CLIENT_ID || "1404523361232752803";
  try {
    discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);
  } catch (err) {
    console.error("Discord SDK init failed", err);
  }
  function getAvatar(user: any): string {
    let avatarSrc = "";
    if (user.avatar) {
      avatarSrc = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
    } else {
      const defaultAvatarIndex = (BigInt(user.id) >> 22n) % 6n;
      avatarSrc = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
    }
    return avatarSrc;
  }

  const allGreenLetterState: LetterState[][] = [
    ["🟩", "🟩", "🟩", "🟩", "🟩"],
    [],
    [],
    [],
    [],
    [],
  ];

  const LetterStateMap: Record<string, LetterState[][]> = {
    "506277152753319956": [],
  };

  function updatePlayers(
    players: Types.GetActivityInstanceConnectedParticipantsResponse
  ) {
    let state = new GameState($mode);
    state.board.state = allGreenLetterState;
    let strings: string[] = [];
    allGreenLetterState.forEach((element) => {
      let length = element.length;
      if (length > 0) {
        //add length amount of spaces
        strings.push(" ".repeat(length));
      } else {
        strings.push("");
      }
    });
    playerData = players.participants.map((p) => ({
      id: p.id,
      name: p.global_name ?? p.username,
      avatar: getAvatar(p),
      gameState: state,
    }));
  }

  if (discordSdk) {
    instanceID = instanceID || discordSdk.instanceId;
    discordSession.instanceId = instanceID;
    (window as any).__discordInstanceId = instanceID;
    setupDiscordSdk().then(() => {
      console.log("Discord SDK is authenticated");
      // Intercept clicks on links that would open a new tab and route through Discord
      (function hookExternalLinks() {
        function getAnchor(el: EventTarget | null): HTMLAnchorElement | null {
          while (el && el instanceof HTMLElement) {
            if (el.tagName === "A") return el as HTMLAnchorElement;
            el = el.parentElement;
          }
          return null;
        }
        function shouldIgnore(e: MouseEvent) {
          return (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          );
        }
        document.addEventListener(
          "click",
          (e) => {
            if (shouldIgnore(e)) return;
            const a = getAnchor(e.target);
            if (!a) return;
            if (a.target !== "_blank") return;
            const href = a.href;
            if (!href) return;
            e.preventDefault();
            openUrlFromDiscord(href);
          },
          true
        );
      })();
      discordSdk.subscribe(
        Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
        updatePlayers
      );
      // Join activity session in backend once authenticated and instance ready
      setTimeout(() => {
        if (auth?.access_token && instanceID) {
          fetch("/api/activity/join", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auth.access_token}`,
            },
            body: JSON.stringify({
              instanceId: instanceID,
              length: $wordLength + 4,
              mode: (GameMode[$mode] || "daily").toString().toLowerCase(),
            }),
          }).catch(() => {});
        }
      }, 0);
    });
  }

  async function openUrlFromDiscord(url: string) {
    if (!discordSdk) return;
    console.log("Opening URL from Discord:", url);
    await discordSdk.commands.openExternalLink({ url: url });
  }

  async function setupDiscordSdk() {
    await discordSdk.ready();
    console.log("Discord SDK is ready");

    // Authorize with Discord Client
    console.log("[discord] starting authorize");
    const { code } = await discordSdk.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds", "applications.commands"],
    });
    console.log(
      "[discord] authorize returned code:",
      code ? code.slice(0, 6) + "..." : "NONE"
    );

    // Retrieve an access_token from your activity's server
    const response = await fetch("/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
      }),
    });
    const tokenJson = await response.json();
    const { access_token } = tokenJson;
    console.log(
      "[discord] /api/token responded, token length:",
      access_token?.length
    );

    // Authenticate with Discord client (using the access_token)
    console.log("[discord] calling authenticate");
    auth = await discordSdk.commands.authenticate({
      access_token,
    });
    discordSession.auth = auth;
    discordSession.accessToken = auth?.access_token;
    (window as any).__discordAuth = auth; // legacy
    (window as any).__discordSession = discordSession;
    console.log(
      "[discord] authenticated, token length:",
      discordSession.accessToken?.length,
      "instanceId:",
      instanceID
    );

    if (auth == null) {
      throw new Error("Authenticate command failed");
    }

    // After successful auth, attempt to hydrate localStorage from backend persistence
    try {
      await hydrateFromBackend();
      // Reinitialize in-memory stores from hydrated localStorage
      settings.set(new Settings(localStorage.getItem("settings")));
      const storedMode = localStorage.getItem("mode");
      if (storedMode) mode.set(+storedMode);
      console.log("Hydrated local state from backend");
    } catch (e) {
      console.warn("Failed hydrating from backend", e);
    }
  }

  async function hydrateFromBackend() {
    if (!auth) return;
    const res = await fetch("/api/userdata", {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    if (!res.ok) return;
    const { data } = await res.json();
    for (const k in data) {
      try {
        localStorage.setItem(k, data[k]);
      } catch {}
    }
  }

  let pendingProgress: LetterState[][][] = [];
  function postProgress(grid: LetterState[][]) {
    if (!discordSession.accessToken || !instanceID) return;
    try {
      fetch("/api/activity/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${discordSession.accessToken}`,
        },
        body: JSON.stringify({ instanceId: instanceID, state: grid }),
      }).catch(() => {});
    } catch (e) {
      console.warn("[discord] progress post failed", e);
    }
  }
  export function sendState(grid: LetterState[][]) {
    const ready = !!discordSession.accessToken && !!instanceID;
    if (!ready) {
      pendingProgress.push(grid);
      if (pendingProgress.length === 1)
        console.log("[discord] queue progress (auth not ready)");
      return;
    }
    postProgress(grid);
  }
  // Flush queued progress once auth & instanceID available (react to auth var changes)
  $: if (auth?.access_token && instanceID && pendingProgress.length) {
    console.log(
      "[discord] flushing queued progress items:",
      pendingProgress.length
    );
    for (const g of pendingProgress) postProgress(g);
    pendingProgress = [];
  }
  // Safety re-attempt if auth failed initially
  let reauthAttempts = 0;
  const reauthInterval = setInterval(async () => {
    if (auth?.access_token || reauthAttempts > 3) {
      if (auth?.access_token) console.log("[discord] reauth not needed");
      clearInterval(reauthInterval);
      return;
    }
    try {
      reauthAttempts++;
      console.warn("[discord] attempting re-auth attempt", reauthAttempts);
      await setupDiscordSdk();
    } catch (e) {
      console.warn("[discord] re-auth attempt failed", e);
    }
  }, 8000);

  // end sendState

  // Wrap localStorage.setItem to also persist to backend when authenticated
  const _origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key: string, value: any) {
    // Ensure both localStorage and server receive stringified values like native localStorage does
    const strValue = String(value);
    try {
      _origSetItem(key, strValue);
    } catch {}
    if (auth?.access_token) {
      fetch(`/api/userdata/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({ value: strValue }),
      }).catch(() => {});
    }
    return null as any;
  } as any;

  // Mirror removeItem
  const _origRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = function (key: string) {
    try {
      _origRemoveItem(key);
    } catch {}
    if (auth?.access_token) {
      fetch(`/api/userdata/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.access_token}` },
      }).catch(() => {});
    }
  } as any;

  // Mirror clear
  const _origClear = localStorage.clear.bind(localStorage);
  localStorage.clear = function () {
    const keys = Object.keys(localStorage);
    try {
      _origClear();
    } catch {}
    if (auth?.access_token) {
      Promise.all(
        keys.map((k) =>
          fetch(`/api/userdata/${encodeURIComponent(k)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${auth.access_token}` },
          })
        )
      ).catch(() => {});
    }
  } as any;

  //GAME CODE
  export let version: string;
  setContext("version", version);
  localStorage.setItem("version", version);
  let stats: Stats;
  let word: string;
  let state: GameState;
  let toaster: Toaster;

  settings.set(new Settings(localStorage.getItem("settings")));
  settings.subscribe((s) =>
    localStorage.setItem("settings", JSON.stringify(s))
  );

  const hash = window.location.hash.slice(1).split("/");
  const modeVal: GameMode = !isNaN(GameMode[hash[0]])
    ? GameMode[hash[0]]
    : +localStorage.getItem("mode") || modeData.default;
  mode.set(modeVal);
  // If this is a link to a specific word make sure that that is the word
  if (!isNaN(+hash[1]) && +hash[1] < getWordNumber(modeVal)) {
    modeData.modes[modeVal].seed =
      (+hash[1] - 1) * modeData.modes[modeVal].unit +
      modeData.modes[modeVal].start;
    modeData.modes[modeVal].historical = true;
  }
  extraHard.set($extraHard || false);
  extraHard.subscribe((v) => {
    const m = $mode;
    stats = new Stats(
      localStorage.getItem(`stats-${m}-${v}-${$wordLength}`) || m
    );
    word =
      words.words[
        seededRandomInt(0, words.words.length, modeData.modes[m].seed)
      ];
    if (modeData.modes[m].historical) {
      state = new GameState(
        m,
        localStorage.getItem(`state-${m}-${v}-${$wordLength}-h`)
      );
    } else {
      state = new GameState(
        m,
        localStorage.getItem(`state-${m}-${v}-${$wordLength}`)
      );
    }
    // Set the letter states when data for a new game mode is loaded so the keyboard is correct
    letterStates.set(new LetterStates(state.board));
    // Inform backend on mode or length change (re-join with updated length)
    if (auth?.access_token && instanceID) {
      fetch("/api/activity/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          instanceId: instanceID,
          length: $wordLength + 4,
          mode: (GameMode[m] || "daily").toString().toLowerCase(),
        }),
      }).catch(() => {});
    }
  });
  mode.subscribe((m) => {
    const v = $extraHard;
    localStorage.setItem("mode", `${m}`);
    window.location.hash = GameMode[m];
    stats = new Stats(
      localStorage.getItem(`stats-${m}-${v}-${$wordLength}`) || m
    );
    word =
      words.words[
        seededRandomInt(0, words.words.length, modeData.modes[m].seed)
      ];
    if (modeData.modes[m].historical) {
      state = new GameState(
        m,
        localStorage.getItem(`state-${m}-${v}-${$wordLength}-h`)
      );
    } else {
      state = new GameState(
        m,
        localStorage.getItem(`state-${m}-${v}-${$wordLength}`)
      );
    }
    // Set the letter states when data for a new game mode is loaded so the keyboard is correct
    letterStates.set(new LetterStates(state.board));
  });

  $: saveState(state);
  let _lastActive = true;
  let _lastGuesses = 0;
  $: (async () => {
    try {
      if (!auth?.access_token || !instanceID || !state) return;
      // When a game becomes inactive (win/lose) and at least one guess was made, notify end once
      if (_lastActive && !state.active && state.guesses > 0) {
        await fetch("/api/activity/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.access_token}`,
          },
          body: JSON.stringify({ instanceId: instanceID }),
        }).catch(() => {});
      }
      _lastActive = state.active;
      _lastGuesses = state.guesses;
    } catch {}
  })();
  let lastgrid: LetterState[][];
  function saveState(state: GameState) {
    if (modeData.modes[$mode].historical) {
      localStorage.setItem(
        `state-${$mode}-${$extraHard}-${$wordLength}-h`,
        state.toString()
      );
    } else {
      localStorage.setItem(
        `state-${$mode}-${$extraHard}-${$wordLength}`,
        state.toString()
      );
    }
    // Push progress to backend after local save
  }
</script>

<Toaster bind:this={toaster} />

{#if toaster}
  <Game {stats} bind:word {toaster} bind:game={state} {sendState} />
{/if}
