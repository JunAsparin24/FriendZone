// Wind shared by everything that sways (trees, grass, palms, reeds, flags) in both towns: a clock and
// a strength the weather sets (1 on a calm day, up to ~3.5 in a gale).
export const wind = { time: { value: 0 }, strength: { value: 1 } };

/** A copy of a material whose vertices above `from` bend in the wind. */
export function withWind(shared, strength = 0.06, from = 1.2) {
  const material = shared.clone(); // never patch the cached, shared material
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind.time;
    shader.uniforms.uGust = wind.strength;
    shader.vertexShader = 'uniform float uWind;\nuniform float uGust;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float h = max(0.0, position.y - ${from.toFixed(2)});
      float gust = uGust * (1.0 + 0.35 * sin(uWind * 0.6 + ip.x * 0.05));
      float lean = (uGust - 1.0) * 0.5; // strong wind pushes everything one way, not just back and forth
      transformed.x += (sin(uWind * (1.7 + uGust * 0.6) + ip.x * 0.35 + ip.z * 0.2) * gust + lean) * ${strength.toFixed(3)} * h;
      transformed.z += cos(uWind * (1.3 + uGust * 0.5) + ip.z * 0.3) * gust * ${(strength * 0.6).toFixed(3)} * h;`,
    );
  };
  material.customProgramCacheKey = () => `wind${strength}${from}`;
  return material;
}

/** The weather right now: 'sunny' | 'cloudy' | 'windy' | 'rain' | 'storm' (set from the server). */
export const weatherState = { kind: 'sunny' };
// how each kind looks: rain (0..1.4 drops), grey (sky), cover (clouds), wind strength, lightning
export const WEATHER_LOOK = {
  sunny: { rain: 0, grey: 0, cover: 0.22, wind: 1, bolt: 0 },
  cloudy: { rain: 0, grey: 0.45, cover: 0.88, wind: 1.3, bolt: 0 },
  windy: { rain: 0, grey: 0.12, cover: 0.55, wind: 3.3, bolt: 0 },
  rain: { rain: 1, grey: 0.85, cover: 0.92, wind: 1.6, bolt: 0 },
  storm: { rain: 1.4, grey: 1, cover: 1, wind: 2.7, bolt: 1 },
};
