// save.js - localStorage persistence for Neon Harbor: Vice Run.
// Stores cash, mission progress, collected packages, player position and
// health. Deliberately tiny and defensive: a corrupt or missing save simply
// means "no save", never a crash.
NH.Save = (function () {
  const KEY = 'neonHarborViceRun.v1';

  function save(state) {
    try {
      const data = {
        cash: state.cash,
        missionIndex: state.missionIndex,
        packages: state.packagesFound,
        health: state.player.health,
        armor: state.player.armor,
        x: state.player.mesh.position.x,
        z: state.player.mesh.position.z,
        heading: state.player.heading,
        playSeconds: state.playSeconds
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return null;
      return data;
    } catch (e) { return null; }
  }

  function exists() { return load() !== null; }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  return { save: save, load: load, exists: exists, clear: clear };
})();
