/* eslint-disable max-len */
/* eslint-disable react/prop-types */
/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
import React, {
  useEffect, useMemo, useState, useCallback, Fragment,
} from 'react';
import {
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  TextField,
  MenuItem,
  Checkbox,
  ListItemText,
  Typography,
  Tooltip,
} from '@material-ui/core';
import {
  Delete,
  Add,
  Done,
  Clear,
  Edit,
  Warning,
  ExpandLess,
  ExpandMore,
} from '@material-ui/icons';
import { KeyboardDatePicker } from '@material-ui/pickers';
import dayjs from 'dayjs';
import { orderBy } from 'lodash-es';
import { v4 as uuidv4 } from 'uuid';
import Select from './select';
import { useSharedState } from '../hooks/useSharedState';
import useAllEventsOrdered from '../hooks/useAllEventsOrdered';
import useAvailableParcels, { processEvent, getAvailableParcelsLookup } from '../hooks/useAvailableParcels';
import { sales as sharedStateSales } from '../sharedState';

function applyCgtDiscount(saleDate, parcelDate, cgtLiability) {
  // eslint-disable-next-line no-param-reassign
  if (cgtLiability > 0 && dayjs(saleDate).diff(dayjs(parcelDate), 'year', true) > 1) cgtLiability /= 2;
  return cgtLiability;
}

function calculateCgtLiability(sale) {
  let cgtLiability = 0;
  let totalUnitsSold = 0;
  for (const parcel of sale.applicableParcels) {
    totalUnitsSold += parcel.unitsSold;
  }
  for (const parcel of sale.applicableParcels) {
    let parcelLiability = (sale.unitPrice * parcel.unitsSold);
    parcelLiability -= parcel.unitsSold * parcel.perUnitCostBase;
    parcelLiability -= sale.brokerage * (parcel.unitsSold / totalUnitsSold);
    cgtLiability += applyCgtDiscount(sale.date, parcel.date, parcelLiability);
  }
  return cgtLiability;
}

export default function SaleList() {
  const [sales, setSales] = useSharedState(sharedStateSales);
  const allEventsOrdered = useAllEventsOrdered();
  const { orderedSales, saleDataLookup } = useMemo(() => {
    const ordered = [];
    const lookup = {};
    const currentHoldings = {};
    for (const event of allEventsOrdered) {
      if (event.type === 'SALE') {
        const decorations = { errors: [], applicableParcels: [] };
        for (const parcel of event.applicableParcels) {
          const currentParcel = currentHoldings[parcel.id];
          if (!currentParcel) decorations.errors.push(`Parcel ${parcel.id} did not exist at the sale date`);
          else if (currentParcel.asxCode !== event.asxCode) {
            decorations.errors.push(`Parcel ${parcel.id} has the wrong ASX Code`);
          } else if (currentParcel.remainingUnits < parcel.unitsSold) {
            decorations.errors.push(`Parcel ${parcel.id} does not have enough remaining units to complete sale`);
          }
          decorations.applicableParcels.push({ ...parcel, unitsAvailable: currentParcel?.remainingUnits ?? '??' });
        }
        decorations.cgtLiability = decorations.errors.length ? null : calculateCgtLiability({
          unitPrice: event.unitPrice,
          date: event.date,
          brokerage: event.brokerage,
          applicableParcels: decorations.applicableParcels.map((p) => ({
            date: currentHoldings[p.id].date,
            perUnitCostBase: currentHoldings[p.id].perUnitCostBase,
            unitsSold: p.unitsSold,
          })),
        });
        ordered.push(event);
        lookup[event.id] = decorations;
      }
      processEvent(event, currentHoldings, /* errorOnMissingParcel: */false);
    }
    return { orderedSales: ordered, saleDataLookup: lookup };
  }, [allEventsOrdered]);

  const [newSaleActive, setNewSaleActive] = useState(false);
  const saveNewSale = (s) => {
    setSales([...sales, s]);
    setNewSaleActive(false);
  };

  const lastRow = newSaleActive
    // eslint-disable-next-line no-use-before-define
    ? <EditSaleRow cancel={() => setNewSaleActive(false)} save={saveNewSale} allEventsOrdered={allEventsOrdered} />
    : (
      <TableRow>
        <TableCell align="right" colSpan={9}>
          <IconButton onClick={() => setNewSaleActive(true)}>
            <Add />
          </IconButton>
        </TableCell>
      </TableRow>
    );

  const [saleIdsBeingEdited, setSaleIdsBeingEdited] = useState([]);
  const editSale = (id) => setSaleIdsBeingEdited([...saleIdsBeingEdited, id]);
  const stopEditingSale = (id) => setSaleIdsBeingEdited(saleIdsBeingEdited.filter((id2) => id2 !== id));
  const saveSale = (s) => {
    setSales([...sales.filter((s2) => s2.id !== s.id), s]);
    stopEditingSale(s.id);
  };

  const [detailSaleIds, setDetailSaleIds] = useState([]);
  const toggleDetails = (saleId) => (detailSaleIds.includes(saleId)
    ? setDetailSaleIds(detailSaleIds.filter((id) => id !== saleId))
    : setDetailSaleIds([...detailSaleIds, saleId]));

  return (
    <TableContainer component={Paper}>
      <Table style={{ minWidth: 650 }} size="small">
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell align="right">Date</TableCell>
            <TableCell align="right">ASX Code</TableCell>
            <TableCell align="right">Applicable Parcels</TableCell>
            <TableCell align="right">Memo</TableCell>
            <TableCell align="right">Unit Price ($/u)</TableCell>
            <TableCell align="right">Brokerage ($)</TableCell>
            <TableCell align="right">
              <Typography variant="body2" color="primary">CGT Liability ($)</Typography>
            </TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {orderedSales.map((s) => (saleIdsBeingEdited.includes(s.id)
            // eslint-disable-next-line max-len, no-use-before-define
            ? <EditSaleRow key={s.id} id={s.id} sale={s} cancel={() => stopEditingSale(s.id)} save={saveSale} allEventsOrdered={allEventsOrdered} />
            : (
              <Fragment key={s.id}>
                <TableRow key={s.id}>
                  <TableCell>
                    {saleDataLookup[s.id].errors.length
                      ? saleDataLookup[s.id].errors.map((e) => (
                        <Tooltip key={e} title={e}>
                          <Warning color="error" />
                        </Tooltip>
                      ))
                      // eslint-disable-next-line react/jsx-no-useless-fragment
                      : <></>}
                  </TableCell>
                  <TableCell align="right">{dayjs(s.date).format('YYYY-MM-DD')}</TableCell>
                  <TableCell align="right">{s.asxCode}</TableCell>
                  <TableCell align="right">
                    {saleDataLookup[s.id]
                      .applicableParcels.map((p) => `${p.id} (${p.unitsSold}/${p.unitsAvailable})`).join(', ')}
                  </TableCell>
                  <TableCell align="right">{s.memo}</TableCell>
                  <TableCell align="right">{s.unitPrice}</TableCell>
                  <TableCell align="right">{s.brokerage}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="primary">
                      {saleDataLookup[s.id].cgtLiability?.toFixed(4) ?? '??'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => toggleDetails(s.id)}>
                      {detailSaleIds.includes(s.id) ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                    <IconButton size="small" onClick={() => editSale(s.id)}><Edit /></IconButton>
                    <IconButton size="small" onClick={() => setSales(sales.filter((s2) => s2.id !== s.id))}>
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
                {detailSaleIds.includes(s.id) && <SaleDetailRow sale={s} />}
              </Fragment>
            )))}
          {lastRow}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function SaleDetailRow(props) {
  const { sale } = props;

  const allEventsOrdered = useAllEventsOrdered();
  const log = useMemo(() => {
    const available = getAvailableParcelsLookup(allEventsOrdered, sale.date, /* errorOnMisingParcel: */false, sale.id);
    // eslint-disable-next-line no-shadow
    const log = [];
    const invalidLog = ['Sale is invalid. Fix issues to see further information.'];

    let totalUnitsSold = 0;
    for (const applicableParcel of sale.applicableParcels) {
      const parcel = available[applicableParcel.id];
      if (!parcel || parcel.asxCode !== sale.asxCode || applicableParcel.unitsSold > parcel.remainingUnits) return invalidLog;
      totalUnitsSold += applicableParcel.unitsSold;
    }
    if (totalUnitsSold <= 0) return invalidLog;
    log.push(`Sale applies to a total of ${totalUnitsSold} units.`);
    for (const applicableParcel of sale.applicableParcels) {
      const parcel = available[applicableParcel.id];
      if (!parcel || parcel.asxCode !== sale.asxCode || applicableParcel.unitsSold > parcel.remainingUnits) return invalidLog;
      let message = `${applicableParcel.unitsSold}x ${parcel.id} ($${parcel.perUnitCostBase.toFixed(4)}/u CB): `;
      // eslint-disable-next-line no-mixed-operators
      const percentage = applicableParcel.unitsSold / totalUnitsSold * 100;
      const finalCostBase = parcel.perUnitCostBase + sale.brokerage / totalUnitsSold;
      message += `${percentage.toFixed(2)}% of brokerage added to CB at sale date. Final CB $${finalCostBase.toFixed(4)}/u. `;
      let capitalGains = (sale.unitPrice - finalCostBase) * applicableParcel.unitsSold;
      message += `Total capital gains: $${capitalGains.toFixed(2)}`;
      if (dayjs(sale.date).diff(dayjs(parcel.date), 'year', true) > 1) {
        capitalGains /= 2;
        message += ', discounted by 50% since parcel was >1yr old';
      }
      message += `. Final CGT Liability: $${capitalGains.toFixed(2)}.`;
      log.push(message);
    }
    return log;
  }, [allEventsOrdered, sale]);

  return (
    <>
      {log.map((e) => (
        <TableRow key={e}>
          <TableCell />
          <TableCell colSpan={7} align="right">
            <Typography variant="body2" color="primary">
              {e}
            </Typography>
          </TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

function EditSaleRow(props) {
  const {
    id,
    save,
    cancel,
    sale,
    allEventsOrdered,
  } = props;

  const [date, setDate] = useState(null);
  const [asxCode, setAsxCode] = useState('');
  const [applicableParcelIds, setApplicableParcelIds] = useState([]);
  const [memo, setMemo] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [brokerage, setBrokerage] = useState('');
  // Lookup from parcel ID to units sold (string) as input by user
  const [unitsSoldLookup, setUnitsSoldLookup] = useState({});

  useEffect(() => {
    setDate(sale?.date ?? null);
    setAsxCode(sale?.asxCode ?? '');
    setApplicableParcelIds(sale?.applicableParcels.map((p) => p.id) ?? []);
    setMemo(sale?.memo ?? '');
    setUnitPrice(sale?.unitPrice.toString() ?? '');
    setBrokerage(sale?.brokerage.toString() ?? '');
    const newUnitsSoldLookup = {};
    for (const parcel of sale?.applicableParcels ?? []) {
      newUnitsSoldLookup[parcel.id] = parcel.unitsSold.toString();
    }
    setUnitsSoldLookup(newUnitsSoldLookup);
  }, [sale]);

  const allAvailableParcels = useAvailableParcels(allEventsOrdered, date, /* errorOnMissingParcel: */false, /* eventIdToExclude: */id);
  const availableParcels = useMemo(() => {
    if (asxCode) return allAvailableParcels.filter((p) => p.asxCode === asxCode);
    return allAvailableParcels;
  }, [allAvailableParcels, asxCode]);

  const availableParcelsLookup = useMemo(() => {
    const lookup = {};
    for (const parcel of availableParcels) {
      lookup[parcel.id] = parcel;
    }
    return lookup;
  }, [availableParcels]);

  const unitsSoldValid = !applicableParcelIds.find((pid) => !parcelSaleIsValid(availableParcelsLookup[pid], unitsSoldLookup[pid]));

  const boundSave = () => save({
    id: id ?? uuidv4(),
    date,
    asxCode,
    applicableParcels: applicableParcelIds.map((pid) => ({
      id: pid,
      // eslint-disable-next-line radix
      unitsSold: parseInt(unitsSoldLookup[pid]),
    })),
    memo,
    unitPrice: parseFloat(unitPrice),
    brokerage: parseFloat(brokerage),
  });

  // eslint-disable-next-line no-restricted-globals
  const unitPriceValid = unitPrice && !isNaN(parseFloat(unitPrice));
  // eslint-disable-next-line no-restricted-globals
  const brokerageValid = brokerage && !isNaN(parseFloat(brokerage));

  const valid = date && applicableParcelIds.length && unitPriceValid && brokerageValid && asxCode
    && unitsSoldValid;

  const canCalculatePerUnitCgtLiabilities = unitPriceValid && date && unitsSoldValid;

  const perUnitCgtLiabilityLookup = useMemo(() => {
    const lookup = {};
    if (!canCalculatePerUnitCgtLiabilities) return {};
    const floatUnitPrice = parseFloat(unitPrice);
    for (const parcel of availableParcels) {
      // Note: Deliberately not including brokerage in this figure since it would create a sort of
      // chicken and egg situation where parcels are chosen by per-unit CGT liability, but this
      // depends on the per-unit brokerage, which depends on the total number of parcels chosen
      const liability = floatUnitPrice - parcel.perUnitCostBase;
      lookup[parcel.id] = applyCgtDiscount(date, parcel.date, liability);
    }
    return lookup;
  }, [unitPrice, date, availableParcels, canCalculatePerUnitCgtLiabilities]);

  const orderedAvailableParcels = useMemo(
    () => orderBy(availableParcels, (p) => perUnitCgtLiabilityLookup[p.id]),
    [availableParcels, perUnitCgtLiabilityLookup],
  );

  let cgtLiability = null;
  if (canCalculatePerUnitCgtLiabilities && brokerageValid) {
    const args = {
      unitPrice: parseFloat(unitPrice),
      date,
      brokerage: parseFloat(brokerage),
      applicableParcels: applicableParcelIds.map((pid) => ({
        date: availableParcelsLookup[pid].date,
        perUnitCostBase: availableParcelsLookup[pid].perUnitCostBase,
        // eslint-disable-next-line radix
        unitsSold: parseInt(unitsSoldLookup[pid]),
      })),
    };
    cgtLiability = calculateCgtLiability(args);
  }

  const rebuildUnitsSoldLookup = useCallback((newApplicableParcelIds) => {
    // eslint-disable-next-line no-shadow
    setUnitsSoldLookup((unitsSoldLookup) => {
      const newUnitsSoldLookup = {};
      for (const parcelId of newApplicableParcelIds) {
        newUnitsSoldLookup[parcelId] = unitsSoldLookup[parcelId] ?? availableParcelsLookup[parcelId].remainingUnits;
      }
      return newUnitsSoldLookup;
    });
  }, [availableParcelsLookup]);

  useEffect(() => {
    setApplicableParcelIds((ids) => {
      const newApplicableParcelIds = ids.filter((pid) => orderedAvailableParcels.find((p) => p.id === pid));
      rebuildUnitsSoldLookup(newApplicableParcelIds);
      return newApplicableParcelIds;
    });
  }, [orderedAvailableParcels, rebuildUnitsSoldLookup]);

  const updateApplicableParcels = (newApplicableParcelIds) => {
    setApplicableParcelIds(newApplicableParcelIds);
    rebuildUnitsSoldLookup(newApplicableParcelIds);
  };

  const toggleSelectAll = () => {
    if (applicableParcelIds.length !== availableParcels.length) updateApplicableParcels(availableParcels.map((p) => p.id));
    else updateApplicableParcels([]);
  };

  const toggleParcel = (parcelId) => {
    if (applicableParcelIds.includes(parcelId)) updateApplicableParcels(applicableParcelIds.filter((pid) => parcelId !== pid));
    else updateApplicableParcels([...applicableParcelIds, parcelId]);
  };

  const updateUnitsSold = (parcelId, newUnitsSold) => {
    const newUnitsSoldLookup = { ...unitsSoldLookup };
    newUnitsSoldLookup[parcelId] = newUnitsSold;
    setUnitsSoldLookup(newUnitsSoldLookup);
  };

  const totalUnitsSold = useMemo(() => {
    let total = 0;
    for (const value of Object.values(unitsSoldLookup)) {
      if (!value) return '??';
      const float = parseFloat(value);
      // eslint-disable-next-line no-restricted-globals
      if (isNaN(float)) return '??';
      // eslint-disable-next-line radix
      const int = parseInt(value);
      if (float !== int) return '??';
      total += int;
    }
    return total;
  }, [unitsSoldLookup]);

  return (
    <>
      <TableRow>
        <TableCell />
        <TableCell align="right">
          <KeyboardDatePicker
            disableToolbar
            variant="inline"
            format="YYYY-MM-DD"
            label="Date"
            value={date}
            error={!date}
            onChange={(e) => setDate(e.toJSON())}
          />
        </TableCell>
        <TableCell align="right">
          <TextField value={asxCode} onChange={(e) => setAsxCode(e.target.value)} label="ASX Code" error={!asxCode} />
        </TableCell>
        <TableCell align="right">
          <Select
            disabled={!date || !orderedAvailableParcels.length || !asxCode}
            labelId="applicable-parcel-select"
            label="Applicable Parcels"
            error={!applicableParcelIds.length}
            multiple
            value={applicableParcelIds}
            fullWidth
            renderValue={(selected) => selected.map((s) => s).join(', ')}
          >
            <MenuItem onClick={toggleSelectAll}>
              <Checkbox
                color="primary"
                checked={applicableParcelIds.length === availableParcels.length}
                indeterminate={applicableParcelIds.length && applicableParcelIds.length < availableParcels.length}
              />
              <ListItemText primary="Select All" secondary={`${totalUnitsSold} currently selected`} />
            </MenuItem>
            {orderedAvailableParcels.map((p) => (
              <MenuItem key={p.id} onClick={() => toggleParcel(p.id)}>
                <Checkbox color="primary" checked={!!applicableParcelIds.includes(p.id)} indeterminate={applicableParcelIds.includes(p.id) && (unitsSoldLookup[p.id] < availableParcelsLookup[p.id].remainingUnits)} />
                <ListItemText primary={`${p.id}${p.memo ? `: ${p.memo}` : ''}`} secondary={`${p.remainingUnits} available, $${perUnitCgtLiabilityLookup[p.id]?.toFixed(4) ?? '??'}/u CGT`} />
              </MenuItem>
            ))}
          </Select>
        </TableCell>
        <TableCell align="right">
          <TextField value={memo} onChange={(e) => setMemo(e.target.value)} label="Memo" />
        </TableCell>
        <TableCell align="right">
          <TextField type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} error={!unitPriceValid} label="Unit Price ($/u)" />
        </TableCell>
        <TableCell align="right">
          <TextField type="number" value={brokerage} onChange={(e) => setBrokerage(e.target.value)} error={!brokerageValid} label="Brokerage ($)" />
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" color="primary">
            Total:
            {cgtLiability?.toFixed(4) ?? '??'}
          </Typography>
        </TableCell>
        <TableCell align="right" rowSpan={applicableParcelIds.length + 1}>
          <IconButton onClick={boundSave} disabled={!valid}><Done /></IconButton>
          <IconButton onClick={cancel}><Clear /></IconButton>
        </TableCell>
      </TableRow>
      {orderBy(applicableParcelIds, (pid) => perUnitCgtLiabilityLookup[pid]).map((pid) => (
        <ApplicableParcel
          key={pid}
          parcel={availableParcelsLookup[pid]}
          perUnitCgtLiability={perUnitCgtLiabilityLookup[pid]}
          unitsSold={unitsSoldLookup[pid]}
          setUnitsSold={(u) => updateUnitsSold(pid, u)}
        />
      ))}
      <TableRow>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell align="right">
          <Typography variant="body2" color="primary">
            Total Units:
            {totalUnitsSold}
          </Typography>
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
      </TableRow>
    </>
  );
}

function parcelSaleIsValid(parcel, unitsSold) {
  if (!unitsSold) return false;
  const soldFloat = parseFloat(unitsSold);
  // eslint-disable-next-line no-restricted-globals
  if (isNaN(soldFloat)) return false;
  // eslint-disable-next-line radix
  const soldInt = parseInt(unitsSold);
  if (soldInt !== soldFloat) return false;
  if (soldInt > (parcel?.remainingUnits ?? 0)) return false;
  if (soldInt <= 0) return false;
  return true;
}

function ApplicableParcel(props) {
  const {
    parcel,
    perUnitCgtLiability,
    unitsSold,
    setUnitsSold,
  } = props;

  const saleValid = parcelSaleIsValid(parcel, unitsSold);
  const cgtLiability = (perUnitCgtLiability !== undefined && saleValid)
    // eslint-disable-next-line radix
    ? (perUnitCgtLiability * parseInt(unitsSold)).toFixed(4) : '??';

  return (
    <TableRow>
      <TableCell />
      <TableCell />
      <TableCell />
      <TableCell align="right">
        <TextField
          type="number"
          value={unitsSold}
          onChange={(e) => setUnitsSold(e.target.value)}
          error={!saleValid}
          label={`Units of ${parcel?.id ?? '??'}`}
          helperText={`${parcel?.remainingUnits ?? '??'} available`}
        />
      </TableCell>
      <TableCell />
      <TableCell />
      <TableCell />
      <TableCell align="right">
        <Typography variant="body2" color="primary">
          {parcel?.id ?? '??'}
          :
          {' '}
          {cgtLiability}
        </Typography>
      </TableCell>
    </TableRow>
  );
}
