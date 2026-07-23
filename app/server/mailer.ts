import { Resend } from 'resend'

function shouldLogOtpToConsole(): boolean {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  return !apiKey && process.env.NODE_ENV !== 'production'
}

function logVerificationCode(email: string, code: string): void {
  if (!shouldLogOtpToConsole()) return
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
      console.error('[auth] Resend failed.', error)
    }
  } catch (error) {
    console.error('[auth] Resend threw.', error)
  }
}
