import './style.css'
import { App } from './app'

async function boot(): Promise<void> {
  // Labels are painted on the canvas with the web fonts; give them a moment to load.
  await Promise.race([Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('800 12px Nunito')]), new Promise((r) => setTimeout(r, 1500))])
  const app = new App(document.getElementById('scene') as HTMLCanvasElement)
  // Handle for poking at the day from the console while developing.
  if (import.meta.env.DEV) Object.assign(window, { __app: app })
}

void boot()
