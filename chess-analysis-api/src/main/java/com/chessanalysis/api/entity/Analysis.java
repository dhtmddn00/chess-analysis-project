package com.chessanalysis.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "analyses")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Analysis {
    
    @Id
    @Column(columnDefinition = "uuid")
    private UUID id;
    
    @Column(name = "username", nullable = false)
    private String username;
    
    @Column(name = "platform", nullable = false)
    private String platform;
    
    @Column(name = "game_count", nullable = false)
    private Integer gameCount;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private AnalysisStatus status;
    
    @Column(name = "progress", nullable = false)
    private Integer progress = 0;
    
    @Column(name = "current_step")
    private String currentStep;
    
    @Column(name = "error_message")
    private String errorMessage;
    
    @Column(name = "report_url")
    private String reportUrl;
    
    @Column(name = "short_link")
    private String shortLink;
    
    @OneToMany(mappedBy = "analysis", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<Game> games;
    
    @OneToOne(mappedBy = "analysis", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private StyleProfile styleProfile;
    
    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @PrePersist
    void generateId() {
        if (id == null) {
            id = UUID.randomUUID();
        }
    }
    
    public enum AnalysisStatus {
        PENDING,
        IN_PROGRESS,
        COMPLETED,
        FAILED,
        CANCELLED
    }
}