import { Resend } from 'resend'

/** Always mirror the code to the API terminal so local signup stays usable. */
function logVerificationCode(email: string, code: string): void {
  // Use console.log (not info) so concurrently / Windows terminals always show it.
  console.log(`\n[auth] Verification code for ${email}: ${code}\n`)
}

export async function sendVerificationEmail(
  email: string,
  code: string,
): Promise<void> {
  logVerificationCode(email, code)

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from =
    process.env.RESEND_FROM ?? '7RANSMI7 <onboarding@resend.dev>'

  if (!apiKey) {
    return
  }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: '7RANSMI7 verification code',
      text: `Your 7RANSMI7 verification code is ${code}. It expires in 10 minutes.`,
    })

    if (error) {
      console.error('[auth] Resend failed; code is still printed above.', error)
    }
  } catch (error) {
    console.error('[auth] Resend threw; code is still printed above.', error)
  }
}
