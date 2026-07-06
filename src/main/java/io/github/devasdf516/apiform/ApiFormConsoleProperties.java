package io.github.devasdf516.apiform;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "api-form-console")
public class ApiFormConsoleProperties {

    /** 콘솔 활성화 여부 (기본 true) */
    private boolean enabled = true;

    /** 콘솔 서빙 경로 */
    private String path = "/api-form.html";

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
}
