package com.chessanalysis.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "style_profiles")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StyleProfile {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analysis_id", nullable = false)
    @JsonIgnore
    private Analysis analysis;
    
    // 12 Style Dimensions
    @Column(name = "aggression")
    private Double aggression;
    
    @Column(name = "tactical_dependency")
    private Double tacticalDependency;
    
    @Column(name = "risk_taking")
    private Double riskTaking;
    
    @Column(name = "positional_orientation")
    private Double positionalOrientation;
    
    @Column(name = "exchange_preference")
    private Double exchangePreference;
    
    @Column(name = "opening_variety")
    private Double openingVariety;
    
    @Column(name = "book_deviation")
    private Double bookDeviation;
    
    @Column(name = "lead_conversion")
    private Double leadConversion;
    
    @Column(name = "endgame_technique")
    private Double endgameTechnique;
    
    @Column(name = "time_management")
    private Double timeManagement;
    
    @Column(name = "consistency")
    private Double consistency;
    
    @Column(name = "swindle_resistance")
    private Double swindleResistance;
    
    // Metadata
    @Column(name = "overall_strength")
    private Double overallStrength;
    
    @Column(name = "style_category")
    private String styleCategory;
    
    @Column(name = "insights_json", columnDefinition = "JSONB")
    private String insightsJson;
    
    @Column(name = "recommendations_json", columnDefinition = "JSONB")
    private String recommendationsJson;
}