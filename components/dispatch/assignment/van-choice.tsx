"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Field,
  Radio,
  RadioGroup,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { VAN_STATUS_LABEL } from "@/lib/dispatch/presentation";
import { VanEligibilityReasons } from "../eligibility";
import { JobItemsOnVan } from "../stock-summary";
import type { BoardVan } from "../van-card";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  label: { display: "flex", flexDirection: "column" },
  secondary: { color: tokens.colorNeutralForeground3 },
  selected: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  unavailable: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  unavailableVan: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS },
});

interface VanChoiceProps {
  job: JobDto;
  /** The backend's ranking: eligible first, then the job's zone. */
  eligibility: VanEligibilityDto[];
  vans: BoardVan[];
  value: string | null;
  onChange: (vanId: string) => void;
  error?: string;
}

/** Only vans the backend says can take the job are selectable; the rest say why not. */
export function VanChoice({ job, eligibility, vans, value, onChange, error }: VanChoiceProps) {
  const styles = useStyles();
  const eligible = eligibility.filter((v) => v.eligible);
  const unavailable = eligibility.filter((v) => !v.eligible);
  const boardVan = (vanId: string) => vans.find((v) => v.van.id === vanId);
  const selected = eligible.find((v) => v.vanId === value);
  const selectedBoardVan = selected ? boardVan(selected.vanId) : undefined;

  return (
    <div className={styles.root}>
      {eligible.length > 0 && (
        <Field label="Van" required validationMessage={error}>
          <RadioGroup value={value ?? ""} onChange={(_, data) => onChange(data.value)}>
            {eligible.map((van) => (
              <Radio
                key={van.vanId}
                value={van.vanId}
                label={
                  <span className={styles.label}>
                    <span>
                      <strong>{van.code}</strong> · {van.technician?.name ?? "no technician"}
                    </span>
                    <Text size={200} className={styles.secondary}>
                      {van.zone ? `${van.zone} zone` : "No usual zone"}
                      {van.zoneMatch ? " · same zone as the branch" : ""}
                    </Text>
                  </span>
                }
              />
            ))}
          </RadioGroup>
        </Field>
      )}

      {selected && (
        <section className={styles.selected} aria-label={`${selected.code} for this job`}>
          <Text weight="semibold">
            {selected.code} with {selected.technician?.name ?? "no technician"}
          </Text>
          <VanEligibilityReasons eligibility={selected} />
          {selectedBoardVan && (
            <JobItemsOnVan
              showStockDetails
              items={job.items}
              lines={selectedBoardVan.stock.lines}
              vanCode={selected.code}
              shortages={selected.shortages}
            />
          )}
        </section>
      )}

      {unavailable.length > 0 && (
        <Accordion collapsible>
          <AccordionItem value="unavailable">
            <AccordionHeader size="small">Vans that can&apos;t take it ({unavailable.length})</AccordionHeader>
            <AccordionPanel>
              <div className={styles.unavailable}>
                {unavailable.map((van) => {
                  const status = boardVan(van.vanId)?.van.status;
                  return (
                    <div key={van.vanId} className={styles.unavailableVan}>
                      <Text weight="semibold">
                        {van.code} · {van.technician?.name ?? "no technician"}
                      </Text>
                      <VanEligibilityReasons
                        eligibility={van}
                        vanStatus={status ? VAN_STATUS_LABEL[status] : undefined}
                      />
                      <JobItemsOnVan
                        showStockDetails
                        items={job.items}
                        lines={boardVan(van.vanId)?.stock.lines ?? []}
                        vanCode={van.code}
                        shortages={van.shortages}
                      />
                    </div>
                  );
                })}
              </div>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
