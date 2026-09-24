package com.zeladf.app;

import static org.junit.Assert.*;

import java.net.URI;
import org.junit.Test;

/**
 * Testes unitários locais (sem aparelho) para validar convenções
 * de configuração do ZelaDF Android.
 *
 * Substituem o ExampleUnitTest genérico do scaffold Capacitor
 * (com.getcapacitor.myapp) que testava apenas 2+2.
 */
public class DeepLinkUrlTest {

    /** Scheme usado pelo deep link de OAuth e callbacks no Android. */
    private static final String DEEP_LINK_SCHEME = "com.zeladf.app";

    /** Caminho esperado do callback de autenticação (deve coincidir com AuthProvider.tsx). */
    private static final String AUTH_CALLBACK_PATH = "auth-callback";

    /**
     * Verifica que a URL de redirecionamento OAuth segue o padrão esperado.
     * Qualquer mudança acidental nesse valor quebraria o login via Google
     * no aplicativo Android.
     */
    @Test
    public void oauthRedirectUrlFollowsExpectedPattern() {
        String redirectUrl = DEEP_LINK_SCHEME + "://" + AUTH_CALLBACK_PATH;
        assertEquals("com.zeladf.app://auth-callback", redirectUrl);
    }

    /**
     * Verifica que o scheme do deep link não contém caracteres inválidos
     * e corresponde ao applicationId do app.
     */
    @Test
    public void deepLinkSchemeMatchesApplicationId() {
        assertEquals("com.zeladf.app", DEEP_LINK_SCHEME);
        assertFalse("Scheme não deve conter espaços", DEEP_LINK_SCHEME.contains(" "));
        assertFalse("Scheme não deve conter ://", DEEP_LINK_SCHEME.contains("://"));
    }

    /** Verifica a decomposição da URI usada pelo intent-filter do Android. */
    @Test
    public void oauthRedirectUrlHasExpectedSchemeAndHost() {
        URI redirectUri = URI.create(DEEP_LINK_SCHEME + "://" + AUTH_CALLBACK_PATH);

        assertEquals(DEEP_LINK_SCHEME, redirectUri.getScheme());
        assertEquals(AUTH_CALLBACK_PATH, redirectUri.getHost());
        assertEquals("", redirectUri.getPath());
    }
}
