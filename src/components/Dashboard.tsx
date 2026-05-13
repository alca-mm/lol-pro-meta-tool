import { useTranslation } from "../i18n/LanguageContext"

interface DashboardProps {
    totalMatches: number
    filteredMatches: number
}

export function Dashboard({ totalMatches, filteredMatches }: DashboardProps) {
    const { t } = useTranslation()

    return (
        <div className="dashboard-stats compact">
            <div className="stat-card">
                <span className="stat-value">{filteredMatches}</span>
                <span className="stat-label">{t("dash_filtered")}</span>
            </div>

            <div className="stat-card">
                <span className="stat-value">{totalMatches}</span>
                <span className="stat-label">{t("dash_total")}</span>
            </div>
        </div>
    )
}