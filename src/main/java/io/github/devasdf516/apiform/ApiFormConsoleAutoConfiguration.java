package io.github.devasdf516.apiform;

import java.io.IOException;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(prefix = "api-form-console", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(ApiFormConsoleProperties.class)
public class ApiFormConsoleAutoConfiguration implements WebMvcConfigurer {

    private final ApiFormConsoleProperties properties;

    public ApiFormConsoleAutoConfiguration(ApiFormConsoleProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // jar 내부 전용 디렉토리 서빙 — 호스트 static/과 충돌 없음,
        // 호스트의 spring.web.resources.add-mappings=false와도 무관하게 동작
        String htmlUrl = properties.getPath().startsWith("/") ? properties.getPath() : "/" + properties.getPath();
        String dir = htmlUrl.substring(0, htmlUrl.lastIndexOf('/') + 1);

        // html이 상대 경로로 참조하는 css/js는 html과 같은 디렉토리 URL로 서빙되어야 한다
        serveFixedFile(registry, htmlUrl, "api-form.html");
        serveFixedFile(registry, dir + "api-form.css", "api-form.css");
        serveFixedFile(registry, dir + "api-form.js", "api-form.js");
    }

    /**
     * URL을 요청 경로와 무관하게 고정된 classpath 파일로 해석한다.
     * 정확 URL 매핑은 요청 전체 경로를 location 뒤에 이어 붙여 해석하므로,
     * 이 리졸버가 없으면 path 커스터마이즈 시 classpath가 URL을 미러링해야만 동작한다.
     */
    private void serveFixedFile(ResourceHandlerRegistry registry, String url, String filename) {
        registry.addResourceHandler(url)
                .addResourceLocations("classpath:/api-form-console/")
                .setCacheControl(CacheControl.noCache()) // 라이브러리 버전업 시 구버전 css/js 캐시 방지 (재검증 요구)
                .resourceChain(false)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource resource = location.createRelative(filename);
                        return resource.isReadable() ? resource : null;
                    }
                });
    }
}
