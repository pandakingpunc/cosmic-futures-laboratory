/** Converts H₀ from km s⁻¹ Mpc⁻¹ to yr⁻¹: Julian year in s over megaparsec in km. */
export const H0_YEAR = 31557600 / (3.085677581491367 * 1e19);
export const LN10 = Math.LN10;
/** Speed of light in km/s; c/H in Mpc for H in km s⁻¹ Mpc⁻¹. */
export const C_KM_S = 299792.458;
/** log₁₀ of one megaparsec in metres (IAU 2015: 1 pc = 648000/π au). */
export const LOG10_MPC_M = 22.489350545222138;
/**
 * −log₁₀ of the Planck length √(ħG/c³) in metres, from CODATA 2018
 * ħ = 1.054571817×10⁻³⁴ J s, G = 6.67430×10⁻¹¹ m³ kg⁻¹ s⁻², c = 299792458 m/s.
 */
export const LOG10_INV_PLANCK_M = 34.79149011215885;
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
