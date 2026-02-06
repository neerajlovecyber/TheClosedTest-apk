import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { TableAggregate } from "@convex-dev/aggregate";

// Total Users Aggregate
// Key: null (Single global count)
export const usersAggregate = new TableAggregate<{
    Key: null;
    DataModel: DataModel;
    TableName: "users";
}>(components.usersAggregate, {
    sortKey: (_doc) => null,
});

// Total Apps Aggregate
// Key: null (Single global count)
export const appsAggregate = new TableAggregate<{
    Key: null;
    DataModel: DataModel;
    TableName: "apps";
}>(components.appsAggregate, {
    sortKey: (_doc) => null,
});

// Active Matches Aggregate
// Key: "active" (We only care about counting active matches mostly, but let's key by status)
export const matchesAggregate = new TableAggregate<{
    Key: string;
    DataModel: DataModel;
    TableName: "matches";
}>(components.matchesAggregate, {
    sortKey: (doc) => doc.status,
});

// Daily Active Users (DAU) Aggregate
// Key: date string (e.g. "2023-10-27")
export const dauAggregate = new TableAggregate<{
    Key: string;
    DataModel: DataModel;
    TableName: "daily_activity";
}>(components.dauAggregate, {
    sortKey: (doc) => doc.date,
});
