/** Build what a QR code holds: a link, a contact card (vCard 3.0), Wi-Fi details, or plain text. */

export type QrKind = 'link' | 'contact' | 'wifi' | 'text'

export interface QrForm {
  kind: QrKind
  url: string
  text: string
  name: string
  company: string
  title: string
  phone: string
  email: string
  website: string
  ssid: string
  password: string
  security: 'WPA' | 'WEP' | 'nopass'
  hidden: boolean
}

export const defaultQrForm = (url = 'https://example.com'): QrForm => ({
  kind: 'link', url, text: '', name: '', company: '', title: '', phone: '', email: '', website: '',
  ssid: '', password: '', security: 'WPA', hidden: false,
})

// vCard text values escape backslash, comma, semicolon and newlines.
const vc = (s: string) => s.trim().replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n')
// Wi-Fi QR values escape backslash, semicolon, comma, colon and double quote.
const wf = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')

export function qrPayload(f: QrForm): string {
  switch (f.kind) {
    case 'link': return f.url.trim()
    case 'text': return f.text.trim()
    case 'wifi': {
      if (!f.ssid.trim()) return ''
      const pass = f.security === 'nopass' ? '' : `P:${wf(f.password)};`
      return `WIFI:T:${f.security};S:${wf(f.ssid)};${pass}${f.hidden ? 'H:true;' : ''};`
    }
    case 'contact': {
      const name = f.name.trim()
      if (!name && !f.phone.trim() && !f.email.trim()) return ''
      const parts = name.split(/\s+/)
      const last = parts.length > 1 ? parts.pop()! : ''
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vc(last)};${vc(parts.join(' '))};;;`, `FN:${vc(name)}`]
      if (f.company.trim()) lines.push(`ORG:${vc(f.company)}`)
      if (f.title.trim()) lines.push(`TITLE:${vc(f.title)}`)
      if (f.phone.trim()) lines.push(`TEL;TYPE=CELL:${vc(f.phone)}`)
      if (f.email.trim()) lines.push(`EMAIL:${vc(f.email)}`)
      if (f.website.trim()) lines.push(`URL:${vc(f.website)}`)
      lines.push('END:VCARD')
      return lines.join('\r\n')
    }
  }
}
