/**
 * Input area of the Tournament Scout: the paste box, the three actions and the
 * honest feedback about what the parser did and did *not* understand.
 *
 * Rule of this panel: a line the parser rejected is always listed with its
 * reason. Nothing is swallowed.
 */

import { useTranslation } from "../../i18n/LanguageContext"
import type { UnparsedLine } from "../../scout/types"
import { fillPlaceholders, scoutUnparsedKey, translateCount } from "./scoutUiHelpers"

export type ScoutParseError = "noInput" | "unrecognized"

interface Props {
    rawInput: string
    onRawInputChange: (value: string) => void
    onParse: () => void
    onClearInput: () => void
    onInsertExample: () => void
    showExampleHint: boolean
    playerCount: number
    unparsedLines: readonly UnparsedLine[]
    duplicatesMerged: number
    parseError: ScoutParseError | null
    multiLink: string | null
    hasParsed: boolean
}

export function ScoutInputPanel({
    rawInput,
    onRawInputChange,
    onParse,
    onClearInput,
    onInsertExample,
    showExampleHint,
    playerCount,
    unparsedLines,
    duplicatesMerged,
    parseError,
    multiLink,
    hasParsed,
}: Props) {
    const { t } = useTranslation()

    return (
        <div className="scout-panel scout-input-panel">
            <label className="scout-field-label" htmlFor="scout-input">
                {t("scout_inputLabel")}
            </label>
            <textarea
                id="scout-input"
                className="scout-textarea"
                value={rawInput}
                rows={6}
                spellCheck={false}
                placeholder={t("scout_inputPlaceholder")}
                onChange={(event) => onRawInputChange(event.target.value)}
            />

            <div className="scout-button-row">
                <button type="button" className="scout-primary-button" onClick={onParse}>
                    {t("scout_parseButton")}
                </button>
                <button type="button" className="secondary-button" onClick={onClearInput}>
                    {t("scout_clearButton")}
                </button>
                <button type="button" className="secondary-button" onClick={onInsertExample}>
                    {t("scout_exampleButton")}
                </button>
            </div>

            {showExampleHint && <p className="scout-example-hint">{t("scout_exampleHint")}</p>}

            {parseError === "noInput" && (
                <p className="scout-error" role="alert">
                    {t("scout_error_noInput")}
                </p>
            )}
            {parseError === "unrecognized" && (
                <p className="scout-error" role="alert">
                    {t("scout_error_unrecognized")}
                </p>
            )}

            {hasParsed && (
                <div className="scout-counts">
                    <span className="scout-count">
                        {translateCount(t, "scout_countPlayers", playerCount)}
                    </span>
                    <span className="scout-count">
                        {translateCount(t, "scout_countUnparsed", unparsedLines.length)}
                    </span>
                    <span className="scout-count">
                        {translateCount(t, "scout_countDuplicates", duplicatesMerged)}
                    </span>
                </div>
            )}

            {duplicatesMerged > 0 && <p className="muted">{t("scout_duplicatesMerged")}</p>}

            {multiLink && (
                <p className="scout-multilink">
                    <a
                        href={multiLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={fillPlaceholders(t("scout_player_openSource"), {
                            source: t("scout_source_opgg"),
                        })}
                        aria-label={fillPlaceholders(t("scout_player_openSource"), {
                            source: t("scout_source_opgg"),
                        })}
                    >
                        {t("scout_source_opgg")}
                    </a>
                </p>
            )}

            {unparsedLines.length > 0 && (
                <div className="scout-unparsed">
                    {/*
                      The hint stays in the open because it is the actionable
                      half. The lines themselves are evidence: useful when
                      something really is missing, noise otherwise, and
                      previously rendered one uncapped bullet each.
                    */}
                    <p className="muted">{t("scout_unparsedHint")}</p>
                    <details className="scout-details scout-unparsed-details">
                        <summary>{t("scout_unparsedLines")}</summary>
                        <ul className="scout-unparsed-list">
                            {unparsedLines.map((line, index) => (
                                <li key={`${line.reason}-${index}`}>
                                    <code>{line.raw}</code>
                                    <span className="muted">
                                        {" · "}
                                        {t(scoutUnparsedKey(line.reason))}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </details>
                </div>
            )}
        </div>
    )
}
