package io.github.devasdf516.apiform;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

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
        registry.addResourceHandler(properties.getPath())
                .addResourceLocations("classpath:/api-form-console/");
    }
}
