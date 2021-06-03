/// <reference types="react/experimental" />
/// <reference types="vite/client" />

import createStyleCache from '@emotion/cache'
import { CacheProvider as StyleCacheProvider } from '@emotion/react'
import createEmotionServer from '@emotion/server/create-instance'
import { Request, Response } from 'express'
import { ReactElement, cloneElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Helmet, HelmetData, HelmetProvider } from 'react-helmet-async'
import { Mount, ServerMount } from 'retil-mount'
import { createHref, createServerNavEnv } from 'retil-nav'

import { App } from './components/app'
import { GlobalStyles } from './globalStyles'
import appLoader from './loaders/appLoader'

export async function render(
  request: Omit<Request, 'params' | 'query'>,
  response: Response,
) {
  const head = [] as ReactElement[]
  const env = {
    ...createServerNavEnv(request, response),
    head,
  }

  if (request.path !== env.nav.pathname) {
    response.statusCode = 308
    response.setHeader('Location', createHref(env.nav))
    return null
  }

  const mount = new ServerMount(appLoader, env)
  const styleCache = createStyleCache({ key: 'sskk' })
  const { extractCriticalToChunks, constructStyleTagsFromChunks } =
    createEmotionServer(styleCache)

  try {
    await mount.preload()

    if (
      (response.statusCode >= 300 && response.statusCode < 400) ||
      response.statusCode >= 500
    ) {
      return null
    } else {
      const { html: appHTML, styles: appStyles } = extractCriticalToChunks(
        renderToString(
          mount.provide(
            <StyleCacheProvider value={styleCache}>
              <GlobalStyles />
              <Mount loader={appLoader} env={env}>
                <App />
              </Mount>
            </StyleCacheProvider>,
          ),
        ),
      )

      const helmetContext = {} as { helmet: HelmetData }
      renderToString(
        <HelmetProvider context={helmetContext}>
          <Helmet>
            {head.length ? (
              head.map((item, i) => cloneElement(item, { key: i }))
            ) : (
              <title>retil.tech</title>
            )}
          </Helmet>
        </HelmetProvider>,
      )

      const headHTML = `
        ${helmetContext.helmet.title.toString()}
        ${helmetContext.helmet.meta.toString()}
        ${helmetContext.helmet.script.toString()}
        ${helmetContext.helmet.style.toString()}
        ${constructStyleTagsFromChunks({ html: appHTML, styles: appStyles })}
      `

      return {
        appHTML,
        headHTML,
      }
    }
  } finally {
    mount.seal()
  }
}
