import { powPortable } from './pow';
/** Converts H₀ from km s⁻¹ Mpc⁻¹ to yr⁻¹: Julian year in s over megaparsec in km. */
export const H0_YEAR = 31557600 / (3.085677581491367 * 1e19);
export const LN10 = Math.LN10;
/** Speed of light in km/s; c/H in Mpc for H in km s⁻¹ Mpc⁻¹. */
export const C_KM_S = 299792.458;
// CODATA 2018 (Tiesinga et al. 2021), SI units. c, h and k_B are exact since
// the 2019 redefinition, so ħ = h/2π is exact too; G carries a relative
// standard uncertainty of 2.2×10⁻⁵, far above every rounding used here.
export const SPEED_OF_LIGHT = 299792458;
export const PLANCK = 6.62607015e-34;
export const HBAR = PLANCK / (2 * Math.PI);
export const BOLTZMANN = 1.380649e-23;
export const GRAVITATION = 6.6743e-11;
/** CODATA 2018 Planck mass √(ħc/G) in kg, as tabulated (2.176434(24)×10⁻⁸). */
export const PLANCK_MASS = 2.176434e-8;
/**
 * Solar mass in kg used by the black-hole tracers since version 0.1.0. With
 * CODATA G it implies GM☉ 3×10⁻⁵ above the IAU 2015 nominal 1.3271244×10²⁰
 * m³ s⁻², a shift of 1.3×10⁻⁵ dex in Hawking temperatures.
 */
export const SOLAR_MASS = 1.98847e30;
/** One megaparsec in metres (IAU 2012 au, IAU 2015 parsec = 648000/π au). */
export const MPC_M = 3.085677581491367e22;
/** log₁₀ of one megaparsec in metres. */
export const LOG10_MPC_M = Math.log10(MPC_M);
/** −log₁₀ of the Planck length √(ħG/c³) in metres. */
export const LOG10_INV_PLANCK_M =
  -0.5 * Math.log10((HBAR * GRAVITATION) / powPortable(SPEED_OF_LIGHT, 3));
/** Hawking temperature ħc³/(8πGk_B M☉) of one solar mass, in kelvin. */
export const SOLAR_HAWKING_TEMPERATURE =
  (HBAR * powPortable(SPEED_OF_LIGHT, 3)) /
  (8 * Math.PI * GRAVITATION * BOLTZMANN * SOLAR_MASS);
/**
 * log₁₀ of the ideal blackbody lifetime 5120πG²M☉³/(ħc⁴) in Julian years,
 * kept at its version 0.1.0 rounding; the expression above evaluates to
 * 67.3213254707, 1.7×10⁻⁹ dex higher.
 */
export const SOLAR_EVAPORATION_LOG_YEARS = 67.321325469;
/** log₁₀ of ħ/(2πk_B) per km s⁻¹ Mpc⁻¹ of H, in kelvin. */
const LOG10_GH_PER_H = Math.log10(
  (HBAR * 1000) / (2 * Math.PI * BOLTZMANN * MPC_M),
);
/**
 * log₁₀ of the de Sitter horizon entropy S/k_B = π R²c³/(ħ g G) for a
 * Hubble radius R, given as log₁₀ R in Mpc, and the G multiplier g. The
 * numerical branch and the matched tail both use this one expression.
 */
export function logDeSitterEntropy(logRadiusMpc: number, g: number): number {
  return (
    Math.log10(Math.PI) +
    2 * (logRadiusMpc + LOG10_MPC_M + LOG10_INV_PLANCK_M) -
    Math.log10(g)
  );
}
/**
 * log₁₀ of the Gibbons–Hawking temperature ħH/(2πk_B) in kelvin for log₁₀ H
 * in km s⁻¹ Mpc⁻¹. H already carries any G multiplier through the Friedmann
 * equation, so the temperature needs no separate G factor.
 */
export function logHorizonTemperature(logH: number): number {
  return LOG10_GH_PER_H + logH;
}
/** H in s⁻¹ for H in km s⁻¹ Mpc⁻¹. */
const perSecond = (H: number) => (H * 1000) / MPC_M;
/**
 * Nariai mass c³/(3√3 G H_Λ) in M☉: the largest Schwarzschild–de Sitter black
 * hole for a cosmological constant with H_Λ = √(Λc²/3) in km s⁻¹ Mpc⁻¹, where
 * its horizon and the cosmological horizon coincide at r = c/(√3 H_Λ).
 */
export function nariaiMass(hLambda: number): number {
  return (
    powPortable(SPEED_OF_LIGHT, 3) /
    (3 * Math.sqrt(3) * GRAVITATION * perSecond(hLambda) * SOLAR_MASS)
  );
}
/** Mass c³/(2GH) in M☉ whose Schwarzschild radius equals the Hubble radius c/H. */
export function hubbleMass(H: number): number {
  return (
    powPortable(SPEED_OF_LIGHT, 3) /
    (2 * GRAVITATION * perSecond(H) * SOLAR_MASS)
  );
}
