/** Converts H₀ from km s⁻¹ Mpc⁻¹ to yr⁻¹: Julian year in s over megaparsec in km. */
export const H0_YEAR = 31557600 / (3.085677581491367 * 1e19);
export const LN10 = Math.LN10;
/** Speed of light in km/s; c/H in Mpc for H in km s⁻¹ Mpc⁻¹. */
export const C_KM_S = 299792.458;
// Horizon entropy S/k_B = π (R/ℓ_P)², evaluated as log₁₀π + 2(log₁₀R[Mpc] +
// LOG10_MPC_M + LOG10_INV_PLANCK_M). The two constants are added in this
// order at the call sites, exactly as in version 0.2.0.
/** log₁₀ of one megaparsec in metres. */
export const LOG10_MPC_M = 22.48935055;
/** −log₁₀ of the Planck length in metres. */
export const LOG10_INV_PLANCK_M = 34.791;
